## 2026-08-05T21:40:46Z
<USER_REQUEST>
You are Explorer (Phase 3 Technical Blueprint) for the Babylon.js ARPG project.
Your working directory is: c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p3

Please read:
1. c:\Users\greg_\source\babylonjs-dungo-crawler\ORIGINAL_REQUEST.md (Requirement R3)
2. c:\Users\greg_\source\babylonjs-dungo-crawler\PROJECT.md
3. Existing code in src/core/Engine.ts, src/entities/Player.ts, src/dungeon/NavMeshManager.ts, src/index.ts

Relevant skills to read and apply:
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\rpg\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-ai\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\game-feel\SKILL.md
- c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\skills\audio-design\SKILL.md

Investigate requirements for Phase 3:
1. `src/entities/components/StatsComponent.ts`: Decoupled stat modifier layer (`base + flat + percent`). Stat types: Health, MaxHealth, Mana, MaxMana, AttackPower, Armor, CritChance, CritDamage, MoveSpeed. `addModifier`, `removeModifier`, `getStat`.
2. `src/entities/Enemy.ts`: Throttled FSM AI (`Idle`, `Aggro`, `Chase`, `Attack`) updated every ~300ms with raycast line-of-sight and stuck detection. Enemy mesh placement from Kenney GLBs.
3. `src/combat/DamageSystem.ts`: Damage calculation math, armor mitigation, crit rolls.
4. `src/ui/JuiceOverlay.ts`: Bouncing floating damage numbers (damage, crit, heal), 100ms white hit flash, freeze frame hook.
5. `src/audio/AudioManager.ts`: Web Audio API 3D spatial sound management with Master/Music/SFX/UI buses & ducking.
6. Entrypoint wiring in `src/index.ts`.

Provide precise interface definitions, class blueprints, and step-by-step implementation plan for the Worker.
Write your analysis and handoff.md in c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p3\handoff.md and report completion via send_message.
</USER_REQUEST>
