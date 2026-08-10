# Scope: E2E Testing Track

## Architecture
- Opaque-box requirement-driven test framework using Babylon.js NullEngine / headless environment executed via `npx tsx tests/...`.
- Test Harness provides headless scene initialization, async GLB loading mocked/handled for NullEngine, event propagation, and assertion utilities.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | TileMap loading | Verify preloading GLBs and instancing in NullEngine | Tier 1 | prompt |
| 2 | Neighbor connectivity classification | Verify bitmask algorithm evaluates all topology types | Tier 1 | prompt |
| 3 | TownHub static creation | Verify static 10x10 plaza hierarchy and node layout | Tier 1 | prompt |
| 4 | Player spawning | Verify player creation, initial transform, and tag/metadata | Tier 1 | prompt |
| 5 | Portal proximity interaction | Verify TownHubAltar interaction trigger within radius | Tier 1 | prompt |
| 6 | Grid edge bitmasking | Verify 8-neighbor bitmask at grid boundaries (0,0), (39,39) | Tier 2 | prompt |
| 7 | Invalid transition inputs | Verify double-triggering or out-of-bounds trigger handling | Tier 2 | prompt |
| 8 | Rapid interaction triggers | Verify stress test on rapid [E]/[F] interaction spam | Tier 2 | prompt |
| 9 | Town Hub to Dungeon Transition & NavMesh | Verify TownHub movement -> portal trigger -> BSP grid -> Recast NavMesh rebuild | Tier 3 | prompt |
| 10 | Full gameplay loop & scene hierarchy | Verify complete town start -> portal interaction -> dungeon load -> clean scene hierarchy | Tier 4 | prompt |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | E2E Test Infra & Harness | Setup headless test harness in `tests/` and write `TEST_INFRA.md` | None | PLANNED |
| M2 | Tier 1 Feature Coverage Tests | Create and verify `tests/tier1-feature-coverage.test.ts` | M1 | PLANNED |
| M3 | Tier 2 Boundary & Corner Tests | Create and verify `tests/tier2-boundary-corner.test.ts` | M1 | PLANNED |
| M4 | Tier 3 Cross-Feature & Tier 4 Gameplay Loop Tests | Create and verify `tests/tier3-cross-feature.test.ts` and `tests/tier4-gameplay-loop.test.ts` | M2, M3 | PLANNED |
| M5 | Final Verification & TEST_READY.md | Run full test suite, verify 0 errors, publish `TEST_READY.md` | M4 | PLANNED |
