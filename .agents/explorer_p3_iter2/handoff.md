# Phase 3 Iteration 2 Remediation Analysis & Handoff Report

**Agent**: Explorer (Phase 3 Iteration 2 Remediation)  
**Working Directory**: `c:\Users\greg_\source\babylonjs-dungo-crawler\.agents\explorer_p3_iter2`  
**Target Files**:
- `src/entities/components/StatsComponent.ts`
- `src/combat/DamageSystem.ts`
- `src/ui/JuiceOverlay.ts`
- `src/audio/AudioManager.ts`
- `src/entities/Enemy.ts`
- `src/entities/Player.ts`
- `src/index.ts`

---

## 1. Observation

### Forensic Audit & Review Findings
From `.agents/auditor_p3/handoff.md` and `.agents/reviewer_p3_1/handoff.md`:
1. **TypeScript Compilation Errors (Worker P3 State)**:
   ```text
   src/combat/DamageSystem.ts(52,20): error TS2339: Property 'modifyHealth' does not exist on type 'StatsComponent'.
   src/entities/Enemy.ts(80,7): error TS2561: Object literal may only specify known properties, but 'MaxHealth' does not exist in type 'Partial<Record<StatType, number>>'. Did you mean to write 'Health'?
   src/entities/Enemy.ts(86,16): error TS2339: Property 'onDeath' does not exist on type 'StatsComponent'.
   src/entities/Player.ts(50,7): error TS2561: Object literal may only specify known properties, but 'MaxHealth' does not exist in type 'Partial<Record<StatType, number>>'. Did you mean to write 'Health'?
   ```
2. **Missing Resource Pool API on `StatsComponent`**:
   - `StatsComponent.ts` manages calculated stats (`base + flat + percent`), but lacks resource pool getters (`currentHealth`, `maxHealth`, `currentMana`, `maxMana`), modification methods (`modifyHealth`, `modifyMana`), and event observables (`onHealthChanged`, `onDeath`, `onManaChanged`).
   - `DamageSystem.ts` attempted to call `(defender.stats as any).modifyHealth(-finalDamage)`, which casts away type safety and fails at runtime if `modifyHealth` is undefined.
3. **Synchronous Thread Blocking in `JuiceOverlay.ts`**:
   - `JuiceOverlay.ts` previously used a synchronous `while(performance.now() - startTime < durationMs)` loop in `triggerFreezeFrame`. The current file replaced it with `this.engine.stopRenderLoop()` and `setTimeout`, which halts all WebGL rendering for 60ms and accesses private Babylon.js properties (`(this.engine as any)._activeRenderLoop`).
4. **Web Audio Graph Memory Leaks in `AudioManager.ts`**:
   - `AudioManager.ts` instantiates `PannerNode`, `GainNode`, and `OscillatorNode` / `BufferSourceNode` in `playSpatialSound`, `playSyntheticSpatialBeep`, `playSyntheticBeep`, `playSwingSFX`, and `playSound`.
   - The nodes were connected to `this.sfxGain` or `this.audioCtx.destination`, but lacked `onended` event handlers to call `.disconnect()`. As a result, abandoned nodes remain connected to the Web Audio processing graph, leaking memory and causing performance degradation over extended combat sessions.

---

## 2. Logic Chain

1. **Resource Pool & Stats Component Unification**:
   - `StatsComponent` is the central component for entity attributes. Combat damage, healing, max health changes, and death events must be driven through `StatsComponent`.
   - Adding `_currentHealth`, `_currentMana`, `currentHealth`, `maxHealth`, `modifyHealth(amount)`, `modifyMana(amount)`, `onHealthChanged`, `onDeath`, and `onManaChanged` directly to `StatsComponent` fulfills Requirement R3 and resolves the missing API errors in `DamageSystem.ts` and `Enemy.ts`.

2. **Enum Key Syntax Compliance**:
   - TypeScript `Partial<Record<StatType, number>>` requires computed property names `[StatType.MaxHp]` when initializing stat objects in object literals. Writing string keys without brackets (`MaxHealth: 60`) triggers `TS2561`.
   - Ensuring `[StatType.MaxHp]`, `[StatType.AttackDamage]`, `[StatType.Armor]`, `[StatType.MoveSpeed]` syntax in `Enemy.ts` and `Player.ts` satisfies strict TypeScript typechecking.

3. **Non-Blocking Micro-Pause Hit-Stop**:
   - Stopping the Babylon.js engine render loop via `engine.stopRenderLoop()` or running a synchronous `while` loop blocks browser events and rendering.
   - Instead, `JuiceOverlay` should maintain a non-blocking `hitStopRemainingMs: number` timer flag. In `src/index.ts`, when `juiceOverlay.isHitStopped()` is active during a frame, gameplay entity logic updates are paused for that frame delta, while the render loop continues running smoothly at full framerate.

4. **Web Audio Lifecycle Management**:
   - Web Audio API nodes (`AudioBufferSourceNode`, `OscillatorNode`, `PannerNode`, `GainNode`) are retained by the audio graph as long as they remain connected.
   - Attaching `source.onended = () => { source.disconnect(); panner.disconnect(); };` and `osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };` ensures complete garbage collection upon sound completion.

---

## 3. Caveats

- **Existing `HealthComponent` Compatibility**: `HealthComponent` remains in the codebase as a standalone resource component for modules that reference it directly. In `DamageSystem.ts`, `Enemy.ts`, and `Player.ts`, health changes on `StatsComponent` will also synchronize with `HealthComponent` to guarantee zero regression for legacy callers.

---

## 4. Conclusion

All 4 audit evidence issues have been fully investigated and mapped to exact, step-by-step code remediations. The implementing Worker must apply the proposed code diffs below to `StatsComponent.ts`, `DamageSystem.ts`, `JuiceOverlay.ts`, `AudioManager.ts`, `Enemy.ts`, `Player.ts`, and `index.ts`.

---

## 5. Remediation Instructions & Step-by-Step Code Diffs for Worker

### Task 1: Update `src/entities/components/StatsComponent.ts`
Add resource pool state (`_currentHealth`, `_currentMana`), getters, observables (`onHealthChanged`, `onDeath`, `onManaChanged`), and methods (`modifyHealth`, `modifyMana`).

```typescript
// Replace lines 38-63 in src/entities/components/StatsComponent.ts with:
export class StatsComponent {
  private baseStats: Map<StatType, number> = new Map();
  private modifiers: StatModifier[] = [];
  private cachedStats: Map<StatType, number> = new Map();
  private isDirty: boolean = true;

  // Resource Pools State
  private _currentHealth: number = 100;
  private _currentMana: number = 100;

  // Observables
  public readonly onStatChanged: Observable<StatChangeEvent> = new Observable<StatChangeEvent>();
  public readonly onHealthChanged: Observable<{ current: number; max: number; delta: number; isFatal: boolean }> = new Observable();
  public readonly onDeath: Observable<void> = new Observable<void>();
  public readonly onManaChanged: Observable<{ current: number; max: number; delta: number }> = new Observable();

  constructor(initialBaseStats?: Partial<Record<StatType, number>>) {
    // Defaults
    this.baseStats.set(StatType.AttackDamage, 15);
    this.baseStats.set(StatType.CritChance, 0.10);
    this.baseStats.set(StatType.Armor, 10);
    this.baseStats.set(StatType.MaxHp, 100);
    this.baseStats.set(StatType.CooldownReduction, 0);
    this.baseStats.set(StatType.MoveSpeed, 7.0);
    this.baseStats.set(StatType.CritDamage, 1.5);

    if (initialBaseStats) {
      for (const [statKey, value] of Object.entries(initialBaseStats)) {
        if (value !== undefined) {
          this.baseStats.set(statKey as StatType, value);
        }
      }
    }

    // Initialize resource pools from initial stats
    this._currentHealth = this.maxHealth;
    this._currentMana = this.maxMana;
  }

  // Resource Pool Getters
  public get currentHealth(): number {
    return this._currentHealth;
  }

  public get maxHealth(): number {
    return this.getStat(StatType.MaxHp);
  }

  public get currentMana(): number {
    return this._currentMana;
  }

  public get maxMana(): number {
    return this.getStat(StatType.MaxMana) || 100;
  }

  public get isAlive(): boolean {
    return this._currentHealth > 0;
  }

  /**
   * Modifies current health by amount (+ for heal, - for damage).
   * Clamps between 0 and maxHealth. Notifies onHealthChanged and onDeath.
   */
  public modifyHealth(amount: number): number {
    if (amount === 0) return this._currentHealth;

    const prevHp = this._currentHealth;
    const maxHp = this.maxHealth;
    const newHp = Math.max(0, Math.min(maxHp, prevHp + amount));
    const delta = newHp - prevHp;

    if (delta !== 0) {
      this._currentHealth = newHp;
      const isFatal = newHp <= 0;

      this.onHealthChanged.notifyObservers({
        current: newHp,
        max: maxHp,
        delta,
        isFatal,
      });

      if (prevHp > 0 && isFatal) {
        this.onDeath.notifyObservers();
      }
    }

    return this._currentHealth;
  }

  /**
   * Modifies current mana by amount (+ for restore, - for spend).
   */
  public modifyMana(amount: number): number {
    if (amount === 0) return this._currentMana;

    const prevMana = this._currentMana;
    const maxMana = this.maxMana;
    const newMana = Math.max(0, Math.min(maxMana, prevMana + amount));
    const delta = newMana - prevMana;

    if (delta !== 0) {
      this._currentMana = newMana;
      this.onManaChanged.notifyObservers({
        current: newMana,
        max: maxMana,
        delta,
      });
    }

    return this._currentMana;
  }
```

In `recalculateAll()`, add clamping for `MaxHp` reduction:
```typescript
      this.cachedStats.set(stat, finalValue);

      if (stat === StatType.MaxHp && this._currentHealth > finalValue) {
        this._currentHealth = finalValue;
      }
```

---

### Task 2: Update `src/combat/DamageSystem.ts`
Remove `(defender.stats as any)` cast and invoke `modifyHealth` directly on `StatsComponent`.

```typescript
// Replace lines 56-65 in src/combat/DamageSystem.ts with:
    // 4. Apply to target stats / health component
    let isFatal = false;
    if (defender.stats) {
      defender.stats.modifyHealth(-finalDamage);
      isFatal = defender.stats.currentHealth <= 0;
      if (defender.health) {
        defender.health.takeDamage(finalDamage);
      }
    } else if (defender.health) {
      const outcome = defender.health.takeDamage(finalDamage);
      isFatal = outcome.isFatal;
    }
```

---

### Task 3: Update `src/entities/Enemy.ts` & `src/entities/Player.ts`
1. In `Enemy.ts` lines 106-123:
```typescript
    this.stats = new StatsComponent({
      [StatType.MaxHp]: config?.maxHp ?? 60,
      [StatType.AttackDamage]: config?.attackDamage ?? 12,
      [StatType.Armor]: config?.armor ?? 5,
      [StatType.MoveSpeed]: config?.moveSpeed ?? 4.5,
    });

    this.health = new HealthComponent(this.stats.maxHealth);

    this.stats.onStatChanged.add((evt) => {
      if (evt.stat === StatType.MaxHp) {
        this.health.setMaxHp(evt.newValue);
      }
    });

    this.stats.onDeath.add(() => {
      this.die();
    });

    this.health.onDeath.add(() => {
      this.die();
    });
```

2. In `Player.ts` lines 51-70:
```typescript
    this.stats = new StatsComponent({
      [StatType.MaxHp]: 120,
      [StatType.AttackDamage]: 22,
      [StatType.Armor]: 12,
      [StatType.CritChance]: 0.15,
      [StatType.CritDamage]: 1.75,
      [StatType.MoveSpeed]: 7.0,
    });

    this.health = new HealthComponent(this.stats.maxHealth);

    this.stats.onStatChanged.add((evt) => {
      if (evt.stat === StatType.MaxHp) {
        this.health.setMaxHp(evt.newValue);
      }
    });

    this.stats.onDeath.add(() => {
      this.isAlive = false;
    });

    this.health.onDeath.add(() => {
      this.isAlive = false;
    });
```

---

### Task 4: Update `src/ui/JuiceOverlay.ts`
Replace `this.engine.stopRenderLoop()` with a clean non-blocking `hitStopRemainingMs` timer.

```typescript
// In src/ui/JuiceOverlay.ts:
// Replace fields (lines 44-46) with:
  // Hit-Stop Freeze Frame State
  private hitStopRemainingMs: number = 0;

// Replace triggerHitStop & triggerFreezeFrame (lines 160-188) with:
  /** Non-blocking micro-pause hit-stop freeze frame timer */
  public triggerHitStop(durationMs: number = 60): void {
    this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, durationMs);
  }

  // Alias for backward compatibility
  public triggerFreezeFrame(durationMs: number = 60): void {
    this.triggerHitStop(durationMs);
  }

  public isHitStopped(): boolean {
    return this.hitStopRemainingMs > 0;
  }

// In update(deltaTime: number), add decrement at top:
  public update(deltaTime: number): void {
    const deltaTimeMs = deltaTime * 1000;

    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs -= deltaTimeMs;
    }
    ...
```

---

### Task 5: Update `src/audio/AudioManager.ts`
Attach `onended` event listeners to disconnect audio nodes when sounds finish.

1. `playSound`:
```typescript
    const busNode = this.getBusNode(bus);
    if (busNode) {
      source.connect(busNode);
      source.onended = () => {
        source.disconnect();
      };
      source.start();
    }
```

2. `playSpatialSound`:
```typescript
    source.connect(panner);
    panner.connect(this.sfxGain);
    source.onended = () => {
      source.disconnect();
      panner.disconnect();
    };
    source.start();
```

3. `playSwingSFX`:
```typescript
    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + 0.08);
```

4. `playSyntheticBeep`:
```typescript
    osc.connect(gain);
    gain.connect(busNode);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + (isCrit ? 0.2 : 0.1));
```

5. `playSyntheticSpatialBeep`:
```typescript
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
    };

    osc.start(now);
    osc.stop(now + (isCrit ? 0.2 : 0.12));
```

---

### Task 6: Update `src/index.ts`
Pause entity update tick when `juiceOverlay.isHitStopped()` is active.

```typescript
// Replace lines 179-195 in src/index.ts with:
  gameEngine.setRenderLoopCallback(() => {
    const rawDeltaTime = gameEngine.getEngine().getDeltaTime() / 1000.0;
    if (rawDeltaTime <= 0) return;

    // Update Juice Overlay Floating Numbers and Flashes
    juiceOverlay.update(rawDeltaTime);

    // Micro-pause gameplay logic updates during hit-stop freeze frame
    if (juiceOverlay.isHitStopped()) return;

    const deltaTime = rawDeltaTime;
    inputManager.update(deltaTime);
    player.update(deltaTime);

    // Update Enemy AI FSMs
    for (const enemy of enemies) {
      if (enemy.isAlive) {
        enemy.update(deltaTime, player);
      }
    }
```

---

## 6. Verification Method

To independently verify the remediation once the Worker applies the changes:

1. **TypeScript Typecheck**:
   ```powershell
   pnpm exec tsc --noEmit
   ```
   *Expected Output*: Exit code `0` with 0 errors.

2. **Production Build**:
   ```powershell
   pnpm run build
   ```
   *Expected Output*: Exit code `0` (`vite v6.4.3 building for production... dist/assets/index-*.js`).
