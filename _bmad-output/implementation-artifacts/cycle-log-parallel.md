# Parallel epic cycle log — DragonWar (DW-1)

Orchestrator-owned. TAB-separated, exactly four fields:
`<UTC-timestamp>` TAB `Epic <N>` TAB `<stage>` TAB `<key=value metadata>`

Per-epic cycle logs live inside each epic's worktree and are committed on that epic branch.

2026-08-27T15:45:52Z	Epic 1	lead_model_gate	model=claude-opus-5 action=proceed
2026-08-27T15:45:52Z	Epic 1	runtime_gate	bmad=6.11.0 uv=0.12.5 python=ok skills=present artifacts_tracked=true
2026-08-27T15:45:52Z	Epic 1	feature_branch_created	repos=. ticket=DW-1 description=dragonwar-v1 root=origin/main
2026-08-27T15:45:52Z	Epic 1	deps_approved	epics=6 waves=1;2;3+5;4;6 concurrency=1_wave max_parallel=2 hash=0d9da8c2 approved_by=user
