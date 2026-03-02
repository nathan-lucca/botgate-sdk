# @botgate/sdk

SDK oficial do BotGate para integrar as configurações do Dashboard diretamente no seu bot.

## Instalação

```bash
npm install @botgate/sdk
```

---

## Como funciona

Quando um dono de servidor configura seu bot pelo **BotGate Dashboard**, as preferências dele (prefixo, canal de boas-vindas, etc.) ficam salvas no banco de dados do BotGate.

Esta lib permite que **o seu bot leia essas configs em tempo real**, com cache local automático para não sobrecarregar a API.

---

## Uso rápido

```ts
import { BotGateSDK } from "@botgate/sdk";

// 1. Inicializar uma vez (no arquivo principal do bot)
const botgate = new BotGateSDK({
  apiKey: "sua-api-key-do-botgate",
  debug: true, // opcional: mostra logs no console
});

// 2. Usar em qualquer evento
client.on("messageCreate", async (message) => {
  if (!message.guild) return;

  // Busca configs do servidor (com cache de 5 minutos automático)
  const settings = await botgate.getGuildSettings(message.guild.id);

  const prefix = settings.prefix ?? "!";
  if (!message.content.startsWith(prefix)) return;

  // ... lógica do seu bot
  console.log(`Prefixo usado: ${prefix}`);
});

// 3. Módulo de boas-vindas
client.on("guildMemberAdd", async (member) => {
  const settings = await botgate.getGuildSettings(member.guild.id);

  if (!settings.welcome_enabled) return;

  const channel = member.guild.channels.cache.get(
    settings.welcome_channel_id ?? "",
  );
  if (!channel?.isTextBased()) return;

  const msg = (settings.welcome_message ?? "Bem-vindo, {user}!").replace(
    "{user}",
    member.toString(),
  );

  channel.send(msg);
});

// 4. Módulo de logs de auditoria
client.on("messageDelete", async (message) => {
  if (!message.guild) return;
  const settings = await botgate.getGuildSettings(message.guild.id);

  if (!settings.logs_enabled) return;

  const logChannel = message.guild.channels.cache.get(
    settings.logs_channel_id ?? "",
  );
  if (!logChannel?.isTextBased()) return;

  logChannel.send(
    `🗑️ Mensagem deletada em ${message.channel}: ${message.content}`,
  );
});
```

---

## Configurações disponíveis

| Campo                | Tipo      | Descrição                                            |
| -------------------- | --------- | ---------------------------------------------------- |
| `prefix`             | `string`  | Prefixo dos comandos do bot                          |
| `welcome_enabled`    | `boolean` | Liga/desliga o módulo de boas-vindas                 |
| `welcome_channel_id` | `string`  | ID do canal de boas-vindas                           |
| `welcome_message`    | `string`  | Mensagem personalizada. Use `{user}` para mencionar. |
| `logs_enabled`       | `boolean` | Liga/desliga o módulo de auditoria                   |
| `logs_channel_id`    | `string`  | ID do canal de logs                                  |

---

## API

### `new BotGateSDK(config)`

| Opção      | Tipo      | Padrão          | Descrição                                    |
| ---------- | --------- | --------------- | -------------------------------------------- |
| `apiKey`   | `string`  | —               | API Key do bot no BotGate (**obrigatório**)  |
| `apiUrl`   | `string`  | URL de produção | URL base da API (para testes locais)         |
| `cacheTtl` | `number`  | `300`           | Segundos que as configs ficam em cache local |
| `debug`    | `boolean` | `false`         | Ativa logs detalhados no console             |

### `getGuildSettings(guildId, forceRefresh?)`

Busca as configs de um servidor. Retorna `{}` vazio se o servidor ainda não foi configurado (nunca vai quebrar o bot).

```ts
const settings = await botgate.getGuildSettings("123456789");
```

### `clearCache(guildId?)`

Limpa o cache de um servidor específico ou de todos.

```ts
botgate.clearCache("123456789"); // limpa um servidor
botgate.clearCache(); // limpa tudo
```

---

## Licença

MIT
