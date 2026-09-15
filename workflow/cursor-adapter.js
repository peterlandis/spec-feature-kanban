/**
 * Cursor SDK local adapter.
 * Docs: https://cursor.com/docs/sdk/typescript
 *
 * Agent.create/send run in a child process so a SIGSEGV in the SDK
 * does not kill the Kanban server.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import { Agent, Cursor, CursorAgentError, JsonlLocalAgentStore } from '@cursor/sdk';
import { describeWorkerNode, ensureWorkerNode } from './worker-node.js';

const DEFAULT_MODEL = 'composer-2.5';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(HERE, '..', '.features-agent-store');
const WORKER_PATH = path.join(HERE, 'agent-worker.js');
const localStore = new JsonlLocalAgentStore(STORE_DIR);

Cursor.configure({ local: { store: localStore } });

function apiKey() {
  const key = (process.env.CURSOR_API_KEY || '').trim();
  if (!key) {
    throw new Error('CURSOR_API_KEY is not set. Save a key in Cursor settings in the app, or export it in the terminal.');
  }
  return key;
}

function modelId() {
  const raw = (process.env.CURSOR_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  if (raw === 'default' || raw === 'auto') return DEFAULT_MODEL;
  return raw;
}

export function isCursorConfigured() {
  return Boolean((process.env.CURSOR_API_KEY || '').trim());
}

export function cursorModel() {
  return modelId();
}

/** Resolve a per-run model override, falling back to the Settings default. */
export function resolveCursorModel(requested) {
  const raw = String(requested || '').trim();
  if (!raw || raw === 'default' || raw === 'auto') return modelId();
  return raw;
}

function crashMessage(code, signal) {
  if (code === 139 || signal === 'SIGSEGV') {
    return 'The Cursor agent process crashed while loading a native module. The board is still running — retry after the worker is on Node 22.';
  }
  return `Cursor agent exited (${code ?? signal}).`;
}

export async function startCursorRun({ agentId, cwd, prompt, tools, model }) {
  const workerExecPath = await ensureWorkerNode();
  const workerInfo = describeWorkerNode(workerExecPath);
  const resolvedModel = resolveCursorModel(model);
  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], {
      execPath: workerExecPath,
      env: {
        ...process.env,
        CURSOR_API_KEY: apiKey(),
        CURSOR_STORE_DIR: STORE_DIR,
      },
    });

    let settled = false;
    let currentAgentId = agentId || null;
    let currentRunId = null;
    const events = [];
    const waiters = [];
    let streamDone = false;
    let waitResult = null;
    let finishWait = null;
    const donePromise = new Promise((doneResolve) => {
      finishWait = doneResolve;
    });

    function wake() {
      while (waiters.length) waiters.shift()();
    }

    function fail(err) {
      if (!waitResult) {
        waitResult = { status: 'error', error: { message: err.message }, result: '' };
        streamDone = true;
        wake();
        finishWait(waitResult);
      }
      if (!settled) {
        settled = true;
        reject(err);
      }
    }

    const handle = {
      get agentId() { return currentAgentId; },
      get runId() { return currentRunId; },
      agent: {
        get agentId() { return currentAgentId; },
        close: () => {
          if (child.connected) child.kill();
        },
        [Symbol.asyncDispose]: async () => {
          if (child.connected) child.kill();
        },
      },
      run: {
        get id() { return currentRunId; },
        supports: (op) => op === 'cancel',
        cancel: async () => {
          if (child.connected) child.send({ type: 'cancel' });
          else child.kill();
        },
        stream: async function* streamEvents() {
          while (!streamDone || events.length) {
            if (events.length) {
              yield events.shift();
              continue;
            }
            await new Promise((resume) => waiters.push(resume));
          }
        },
        wait: () => donePromise,
      },
    };

    child.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'started') {
        currentAgentId = msg.agentId;
        return;
      }
      if (msg.type === 'event') {
        events.push(msg.event);
        wake();
        return;
      }
      if (msg.type === 'running') {
        currentAgentId = msg.agentId;
        currentRunId = msg.runId;
        return;
      }
      if (msg.type === 'done') {
        waitResult = msg.result || { status: 'finished', result: '' };
        streamDone = true;
        wake();
        finishWait(waitResult);
        return;
      }
      if (msg.type === 'error') {
        fail(new Error(msg.message || 'Cursor agent failed'));
      }
    });

    child.on('error', (err) => {
      fail(err);
    });

    child.on('exit', (code, signal) => {
      if (waitResult) return;
      fail(new Error(crashMessage(code, signal)));
    });

    child.send({
      type: 'start',
      agentId: agentId || null,
      cwd,
      prompt,
      tools,
      model: resolvedModel,
    });
    settled = true;
    resolve({ ...handle, workerNode: workerInfo, model: resolvedModel });
  });
}

export async function cancelCursorRun(run, { runId, cwd } = {}) {
  if (run && typeof run.supports === 'function' && run.supports('cancel')) {
    await run.cancel();
    return;
  }
  if (run && typeof run.cancel === 'function') {
    await run.cancel();
    return;
  }
  if (runId) {
    await Agent.cancelRun(runId, { runtime: 'local', cwd });
  }
}

export async function disposeAgent(agent) {
  if (!agent) return;
  try {
    if (typeof agent[Symbol.asyncDispose] === 'function') {
      await agent[Symbol.asyncDispose]();
      return;
    }
  } catch {
    // fall through to close()
  }
  if (typeof agent.close === 'function') agent.close();
}

export function describeCursorError(err) {
  if (err instanceof CursorAgentError) {
    return {
      message: err.message,
      retryable: Boolean(err.isRetryable),
    };
  }
  return { message: err && err.message ? err.message : String(err), retryable: false };
}
