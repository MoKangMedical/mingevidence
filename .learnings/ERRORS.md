## [ERR-20260323-001] package_insert_priority_import_timeout

**Logged**: 2026-03-23T03:44:56Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
`sync-package-insert-priority` 在获取进口药品查询 token 时出现外部接口超时，导致整条同步任务失败。

### Error
```text
Error: Failed to obtain access token for import: {"reason":"Read timed out","error_code":"10000"}
```

### Context
- Command: `pnpm sync:package-insert-priority`
- External dependency: `https://app.gjzwfw.gov.cn/jimps/link.do`
- Failure point: import channel token acquisition in `scripts/sync-package-insert-priority.mjs`

### Suggested Fix
为 token 获取和药品库查询补重试、超时和通道级容错，避免单个外部通道抖动导致整条自动化失败。

### Metadata
- Reproducible: unknown
- Related Files: scripts/sync-package-insert-priority.mjs

---
