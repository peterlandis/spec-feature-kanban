/**
 * Staged prompts for the local Cursor agent. Feature text is untrusted.
 */

function quote(value) {
  return String(value || '').replace(/```/g, '`\u200b``');
}

export function planningPrompt(feature, paths) {
  return `You are writing specification artifacts only. Do not implement product code.

Feature ID: ${quote(feature.featureId)}
Title: ${quote(feature.title)}
Description: ${quote(feature.description)}
Phase: ${quote(feature.phase)}
Depends: ${quote(feature.depends || '-')}
Notes: ${quote(feature.notes)}

Fill in these existing files using the repo templates and this feature:
- Plan: ${paths.planRel}
- Tasks: ${paths.tasksRel}

Rules:
- Write a concrete, short plan and a checklist of implementation tasks.
- Do not edit application source files.
- Do not commit, push, merge, or open a pull request.
- Stop when the plan and task files are ready for human review.
`;
}

export function revisionPrompt(feature, note) {
  return `Revise only the plan and task markdown for ${quote(feature.featureId)}.

Human revision request:
${quote(note)}

Rules:
- Edit the existing plan and task files only.
- Do not implement product code.
- Do not commit, push, merge, or open a pull request.
- Stop when the revised artifacts are ready for human review.
`;
}

export function implementPrompt(feature, paths) {
  return `The human approved the plan and tasks for ${quote(feature.featureId)}. Implement only that approved scope.

Feature ID: ${quote(feature.featureId)}
Title: ${quote(feature.title)}
Plan: ${paths.planRel}
Tasks: ${paths.tasksRel}

When implementation and verification are done, also write:
- ${paths.reviewRel}
- ${paths.completionRel}

Rules:
- Follow the approved plan and task list.
- Do not merge or deploy.
- Do not open a pull request; a human will do that later from the Ship tab.
- Stop after the code, security review, and completion summary are written.
`;
}
