# Agent Note: Matching a video project to the session that produced it

Status: implemented

English | [中文](2026-10-19-video-project-producing-session-match.zh.md)

## Problem

The video shell mode lists the projects an agent wrote, while the conversation pane beside it shows whatever session the user happens to be in. Selecting a project gave no way back to the session that built it, because nothing records the pairing. `script.json` carries no session id and the project directory carries no marker file, and `SessionHeader.cwd` holds the workspace root a session started in — never the project subfolder the agent later created inside it — so every project under one workspace matches the same candidate sessions and the directory alone cannot choose between them. The user's own history is the only place the pairing survives: whoever built a project wrote paths inside it.

## Decision

The pairing is inferred from evidence the session log already holds, and the browser offers the switch rather than making it.

`GET /api/video/project-session?path=<project>` answers `{ sessionId: SessionId | null }`. `findProducingSession` walks `sessionQuery.listSessions()` newest-first, keeps the sessions whose recorded `cwd` contains the project directory under `FileSystem.contains`, and asks the full-text index for that directory relative to the `cwd`. The relative spelling is the load-bearing choice: the query is quoted into one FTS5 phrase and the `unicode61` tokenizer treats `\` and `/` alike and drops both, so one query matches the absolute and the relative spelling of the same path with no log line read and no dependence on snippet length. At most 12 candidates are probed, newest first, so a long history spends the budget on the likeliest answers. A project sitting at its session's own `cwd` leaves no path below it to search for, so the newest such session is the only answer available and is returned without a probe.

A deployment that turned content search off matches no project at all, which is a configuration fault rather than an absent reference, so `SESSION_QUERY_SEARCH_DISABLED` is rethrown instead of folded into the `null` answer; every other probe failure is one unreadable session and the search continues. `dsh-video-app` opens the index with `openAt: first-search` over the layers that ship it closed, so the shipped profile can answer.

In the browser the match is one more member of the roster controller's snapshot, `sessionMatch`, asked again on every poll while it is still null because the session that built a project may still be writing the log the match reads. `VideoSessionBanner` renders it as a card on the conversation's `conversation.input.dock` slot and switches sessions only on a click; it stays hidden while the conversation already is the match, and the controller's `start()` stopper clears the match so the card does not follow the user out of the video mode.

## Alternatives considered

**Record the session id in `script.json`.** This lost because it covers only projects written after the change, leaves every existing project unmatched, and hands a host-owned fact to the video preset's persona — the agent would have to know its own session id and write it correctly for the host to trust it.

**Match on `cwd` ancestry alone.** This lost because ancestry narrows the corpus to a set, not an answer: every project under one workspace shares the same ancestors, so the choice would fall to recency, which is wrong whenever a user runs two sessions in one workspace.

**Read each candidate log and scan it for the path.** This lost because the full-text index already answers the same question in one phrase query, while scanning is corpus-sized I/O per selection and only finds a path that happens to fall inside a read window.

**Switch the conversation automatically on selection.** This lost because it replaces the conversation the user is in and loses their place in it; the card offers the switch and the user decides.

**Match in the browser from the session list it already holds.** This lost because the client's session list carries headers only, so it holds no evidence to match on; the host owns the corpus and the index.

## Consequences

The video surface gained a way back into a project's history without a new persisted fact, at the cost of an answer that is inferred: a project no retained log references answers `null` and shows no card, and a workspace whose sessions all mention the path answers the newest of them. The host data plane now depends on `ctx.sessionQuery` and on content search being open, so the bundle that mounts it carries that override and a later layer closing the index turns the route into a failure rather than a silent no-match. The conversation's composer dock gained a second contributor, which pins the dock as a place a feature plugin can offer a session-scoped action without owning the conversation surface.
