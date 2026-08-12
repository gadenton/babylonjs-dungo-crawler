import { Observable } from "@babylonjs/core/Misc/observable";

export type GameState = "MAIN_MENU" | "TOWN_HUB" | "DUNGEON" | "PAUSED";

export class GameStateManager {
  private currentState: GameState;
  private previousState: GameState;

  public readonly onStateChanged: Observable<GameState> = new Observable<GameState>();

  constructor(initialState: GameState = "MAIN_MENU") {
    this.currentState = initialState;
    this.previousState = initialState;
  }

  public getState(): GameState {
    return this.currentState;
  }

  public setState(newState: GameState): void {
    if (this.currentState === newState) return;
    this.previousState = this.currentState;
    this.currentState = newState;
    this.onStateChanged.notifyObservers(this.currentState);
  }

  public isPaused(): boolean {
    return this.currentState === "PAUSED";
  }

  public setPaused(paused: boolean): void {
    if (paused) {
      if (this.currentState !== "PAUSED") {
        this.setState("PAUSED");
      }
    } else {
      if (this.currentState === "PAUSED") {
        const resumeState =
          this.previousState && this.previousState !== "PAUSED" && this.previousState !== "MAIN_MENU"
            ? this.previousState
            : "TOWN_HUB";
        this.setState(resumeState);
      }
    }
  }

  public getPreviousState(): GameState {
    return this.previousState;
  }
}
