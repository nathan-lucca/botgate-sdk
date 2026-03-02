import axios, { AxiosInstance } from "axios";

// ─────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────

/**
 * Configurações de inicialização do SDK
 */
export interface BotGateSdkConfig {
  /** API Key do bot no BotGate (obrigatório) */
  apiKey: string;

  /** URL base da API do BotGate (opcional, padrão: produção) */
  apiUrl?: string;

  /**
   * Tempo em segundos que as configs de um servidor ficam em cache local.
   * Evita requisições repetidas. (padrão: 300 = 5 minutos)
   */
  cacheTtl?: number;

  /** Ativar logs de debug no console (padrão: false) */
  debug?: boolean;
}

/**
 * Configurações de um servidor salvas pelo usuário no BotGate Dashboard
 */
export interface GuildSettings {
  /** Prefixo do bot para esse servidor */
  prefix?: string;

  // ── Módulo Boas-vindas ────────────────────────────────
  /** Módulo de boas-vindas ativo? */
  welcome_enabled?: boolean;
  /** ID do canal de boas-vindas */
  welcome_channel_id?: string;
  /** Mensagem personalizada de boas-vindas. Use {user} para mencionar. */
  welcome_message?: string;

  // ── Módulo Auditoria ──────────────────────────────────
  /** Módulo de logs de auditoria ativo? */
  logs_enabled?: boolean;
  /** ID do canal de logs */
  logs_channel_id?: string;

  /** Qualquer outra config futura (extensível) */
  [key: string]: unknown;
}

/**
 * Resposta da API do BotGate
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SdkGuildData {
  guildId: string;
  settings: GuildSettings;
  updatedAt: string | null;
  cacheTtl: number;
}

// ─────────────────────────────────────────────────────────
// Cache interno
// ─────────────────────────────────────────────────────────
interface CacheEntry {
  settings: GuildSettings;
  fetchedAt: number;
  ttl: number;
}

// ─────────────────────────────────────────────────────────
// Classe principal
// ─────────────────────────────────────────────────────────

/**
 * Cliente do BotGate SDK para leitura de configurações de servidores.
 *
 * @example
 * ```ts
 * import { BotGateSDK } from '@botgate/sdk';
 *
 * const botgate = new BotGateSDK({ apiKey: 'sua-api-key' });
 *
 * client.on('messageCreate', async (message) => {
 *   const settings = await botgate.getGuildSettings(message.guild.id);
 *   const prefix = settings.prefix ?? '!';
 *
 *   if (!message.content.startsWith(prefix)) return;
 *   // ... lógica do bot
 * });
 * ```
 */
export class BotGateSDK {
  private http: AxiosInstance;
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTtl: number;
  private debug: boolean;

  constructor(config: BotGateSdkConfig) {
    if (!config.apiKey) {
      throw new Error("[BotGate SDK] apiKey é obrigatório.");
    }

    this.defaultTtl = (config.cacheTtl ?? 300) * 1000; // converte para ms
    this.debug = config.debug ?? false;

    this.http = axios.create({
      baseURL: config.apiUrl ?? "https://api.botgate.coden8n.shop",
      timeout: 8000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "BotGate-SDK/1.0.0",
      },
    });

    this.log("✅ BotGate SDK inicializado.");
  }

  /**
   * Busca as configurações de um servidor específico.
   *
   * As configs são cacheadas localmente por `cacheTtl` segundos
   * para evitar sobrecarga da API em servidores movimentados.
   *
   * @param guildId - ID do servidor Discord
   * @param forceRefresh - Ignorar cache e buscar da API agora (padrão: false)
   */
  public async getGuildSettings(
    guildId: string,
    forceRefresh = false,
  ): Promise<GuildSettings> {
    // 1. Verificar cache
    if (!forceRefresh) {
      const cached = this.getCached(guildId);
      if (cached) {
        this.log(`📦 Cache hit para guild ${guildId}`);
        return cached;
      }
    }

    // 2. Buscar na API
    this.log(`🌐 Buscando settings para guild ${guildId} na API...`);

    try {
      const response = await this.http.get<ApiResponse<SdkGuildData>>(
        `/api/dashboard/sdk/guilds/${guildId}/settings`,
      );

      if (!response.data.success || !response.data.data) {
        this.log(`⚠️ API retornou falha para guild ${guildId}.`);
        return {};
      }

      const { settings, cacheTtl } = response.data.data;

      // 3. Salvar no cache
      this.setCache(guildId, settings, cacheTtl * 1000);
      this.log(`✅ Settings carregados para guild ${guildId}.`);

      return settings;
    } catch (error: any) {
      this.log(
        `❌ Erro ao buscar settings para guild ${guildId}: ${error.message}`,
      );
      // Retorna objeto vazio para não quebrar o bot por uma falha de rede
      return {};
    }
  }

  /**
   * Limpa o cache de um servidor específico.
   * Útil para forçar a releitura após mudanças manuais.
   *
   * @param guildId - ID do servidor. Se omitido, limpa todo o cache.
   */
  public clearCache(guildId?: string): void {
    if (guildId) {
      this.cache.delete(guildId);
      this.log(`🗑️ Cache limpo para guild ${guildId}`);
    } else {
      this.cache.clear();
      this.log("🗑️ Cache global limpo.");
    }
  }

  /**
   * Retorna quantos servidores estão com cache ativo no momento.
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  // ─── Privados ───────────────────────────────────────────

  private getCached(guildId: string): GuildSettings | null {
    const entry = this.cache.get(guildId);
    if (!entry) return null;

    const expired = Date.now() - entry.fetchedAt > entry.ttl;
    if (expired) {
      this.cache.delete(guildId);
      return null;
    }

    return entry.settings;
  }

  private setCache(
    guildId: string,
    settings: GuildSettings,
    ttlMs: number,
  ): void {
    this.cache.set(guildId, {
      settings,
      fetchedAt: Date.now(),
      ttl: ttlMs || this.defaultTtl,
    });
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[BotGate SDK] [${new Date().toISOString()}] ${message}`);
    }
  }
}

export default BotGateSDK;
