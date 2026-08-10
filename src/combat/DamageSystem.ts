import { Observable } from "@babylonjs/core/Misc/observable";
import { StatsComponent, StatType } from "../entities/components/StatsComponent";
import { HealthComponent } from "../entities/components/HealthComponent";

export interface DamageResult {
  attacker: any;
  target: any;
  rawDamage: number;
  mitigatedDamage: number;
  finalDamage: number;
  isCrit: boolean;
  isFatal: boolean;
  timestamp: number;
}

export interface DamageAppliedEvent {
  target: any;
  amount: number;
  isCrit: boolean;
  isFatal: boolean;
  attacker: any;
  result: DamageResult;
}

export class DamageSystem {
  public static readonly onDamageApplied: Observable<DamageAppliedEvent> = new Observable<DamageAppliedEvent>();

  /**
   * Main hit resolution method
   */
  public static resolveDamage(
    attacker: { stats?: StatsComponent; [key: string]: any },
    defender: { health?: HealthComponent; stats?: StatsComponent; [key: string]: any },
    rawDamageOverride?: number,
    canCrit: boolean = true,
    critMultiplier: number = 1.5
  ): DamageResult {
    // 1. Gather raw damage
    let rawDamage = rawDamageOverride;
    if (rawDamage === undefined) {
      rawDamage = attacker.stats ? attacker.stats.getStat(StatType.AttackDamage) : 10;
    }

    // 2. Armor mitigation formula: mitigated = raw * (100 / (100 + armor))
    const defenderArmor = defender.stats ? defender.stats.getStat(StatType.Armor) : 0;
    const armorFactor = 100 / (100 + Math.max(0, defenderArmor));
    const mitigatedDamage = rawDamage * armorFactor;

    // 3. Crit roll: isCrit = Math.random() < critChance, applying 1.5x crit multiplier
    const attackerCritChance = (canCrit && attacker.stats) ? attacker.stats.getStat(StatType.CritChance) : 0;
    const isCrit = canCrit && Math.random() < attackerCritChance;

    const actualCritMult = attacker.stats ? (attacker.stats.getStat(StatType.CritDamage) || critMultiplier) : critMultiplier;
    const finalDamage = Math.max(1, Math.round(isCrit ? mitigatedDamage * actualCritMult : mitigatedDamage));

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

    const result: DamageResult = {
      attacker,
      target: defender,
      rawDamage,
      mitigatedDamage,
      finalDamage,
      isCrit,
      isFatal,
      timestamp: performance.now(),
    };

    // 5. Notify observers
    DamageSystem.onDamageApplied.notifyObservers({
      target: defender,
      amount: finalDamage,
      isCrit,
      isFatal,
      attacker,
      result,
    });

    return result;
  }

  // Alias for backward compatibility
  public static applyDamage(
    attacker: { stats?: StatsComponent; [key: string]: any },
    defender: { health?: HealthComponent; stats?: StatsComponent; [key: string]: any },
    skillMultiplier: number = 1.0
  ): DamageResult {
    const raw = attacker.stats ? attacker.stats.getStat(StatType.AttackDamage) * skillMultiplier : 10 * skillMultiplier;
    return DamageSystem.resolveDamage(attacker, defender, raw);
  }
}
