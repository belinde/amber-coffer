/**
 * Discord Embedded App SDK wrapper (stub).
 * Real initialization will use @discord/embedded-app-sdk when running inside Discord.
 */

export interface DiscordClientConfig {
  readonly clientId: string;
}

export class DiscordClient {
  private readonly config: DiscordClientConfig;

  constructor(config: DiscordClientConfig) {
    this.config = config;
  }

  /** Returns whether the app is running inside a Discord Activity iframe. */
  isEmbedded(): boolean {
    return typeof window !== 'undefined' && window.parent !== window;
  }

  /** Stub: authorize and obtain participant context. */
  authorize(): void {
    if (!this.config.clientId) {
      throw new Error('Discord clientId is required');
    }
    // TODO: integrate @discord/embedded-app-sdk
  }

  getClientId(): string {
    return this.config.clientId;
  }
}

export function createDiscordClient(clientId: string): DiscordClient {
  return new DiscordClient({ clientId });
}
