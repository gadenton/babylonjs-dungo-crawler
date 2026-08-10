import { Observable } from "@babylonjs/core/Misc/observable";

export interface HealthChangeEvent {
  currentHp: number;
  maxHp: number;
  delta: number;
  isFatal: boolean;
}

export class HealthComponent {
  private currentHp: number;
  private maxHp: number;
  public isInvulnerable: boolean = false;

  public readonly onHealthChanged: Observable<HealthChangeEvent> = new Observable<HealthChangeEvent>();
  public readonly onDeath: Observable<void> = new Observable<void>();

  constructor(maxHp: number = 100) {
    this.maxHp = Math.max(1, maxHp);
    this.currentHp = this.maxHp;
  }

  public get current(): number {
    return this.currentHp;
  }

  public get max(): number {
    return this.maxHp;
  }

  public get isAlive(): boolean {
    return this.currentHp > 0;
  }

  public isDead(): boolean {
    return this.currentHp <= 0;
  }

  public get healthPercent(): number {
    return this.maxHp > 0 ? this.currentHp / this.maxHp : 0;
  }

  public setCurrentHp(newHp: number): void {
    const oldHp = this.currentHp;
    this.currentHp = Math.max(0, Math.min(this.maxHp, newHp));
    this.onHealthChanged.notifyObservers({
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      delta: this.currentHp - oldHp,
      isFatal: this.currentHp <= 0,
    });
  }

  public setMaxHp(newMaxHp: number, scaleCurrentRatio: boolean = false): void {
    const oldMax = this.maxHp;
    this.maxHp = Math.max(1, newMaxHp);

    if (scaleCurrentRatio && oldMax > 0) {
      const ratio = this.currentHp / oldMax;
      this.currentHp = Math.round(this.maxHp * ratio);
    } else {
      this.currentHp = Math.min(this.currentHp, this.maxHp);
    }

    this.onHealthChanged.notifyObservers({
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      delta: 0,
      isFatal: false,
    });
  }

  public takeDamage(amount: number): { actualDamage: number; isFatal: boolean } {
    if (!this.isAlive || this.isInvulnerable || amount <= 0) {
      return { actualDamage: 0, isFatal: false };
    }

    const actualDamage = Math.min(this.currentHp, amount);
    this.currentHp -= actualDamage;
    const isFatal = this.currentHp <= 0;

    this.onHealthChanged.notifyObservers({
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      delta: -actualDamage,
      isFatal,
    });

    if (isFatal) {
      this.onDeath.notifyObservers();
    }

    return { actualDamage, isFatal };
  }

  public heal(amount: number): number {
    if (!this.isAlive || amount <= 0) return 0;

    const oldHp = this.currentHp;
    this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    const actualHeal = this.currentHp - oldHp;

    if (actualHeal > 0) {
      this.onHealthChanged.notifyObservers({
        currentHp: this.currentHp,
        maxHp: this.maxHp,
        delta: actualHeal,
        isFatal: false,
      });
    }

    return actualHeal;
  }
}
