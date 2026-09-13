/**
 * Runs a Cursor local agent in a child process so a native crash
 * cannot take down the Kanban server.
 */

import { Agent, Cursor, JsonlLocalAgentStore } from '@cursor/sdk';

const storeDir = process.env.CURSOR_STORE_DIR;
if (!storeDir) {
  process.send({ type: 'error', message: 'CURSOR_STORE_DIR is not set.' });
  process.exit(1);
}

const store = new JsonlLocalAgentStore(storeDir);
Cursor.configure({ local: { store } });

let run = null;

process.on('message', async (msg) => {
  try {
    if (!msg || msg.type === 'cancel') {
      if (run && typeof run.cancel === 'function') await run.cancel();
      return;
    }
    if (msg.type !== 'start') return;

    const options = {
      apiKey: process.env.CURSOR_API_KEY,
      model: { id: msg.model },
      local: { cwd: msg.cwd, store },
      tools: msg.tools,
    };
    const agent = msg.agentId
      ? await Agent.resume(msg.agentId, options)
      : await Agent.create(options);
    process.send({ type: 'started', agentId: agent.agentId });

    run = await agent.send(msg.prompt);
    process.send({ type: 'running', agentId: agent.agentId, runId: run.id });

    if (run.stream) {
      for await (const event of run.stream()) {
        process.send({ type: 'event', event });
      }
    }

    const result = await run.wait();
    process.send({
      type: 'done',
      agentId: agent.agentId,
      runId: run.id,
      result,
    });
    process.exit(0);
  } catch (err) {
    process.send({
      type: 'error',
      message: err && err.message ? err.message : String(err),
    });
    process.exit(1);
  }
});
