import "reflect-metadata";
import path from "path";
import { Intents, Interaction, Message } from "discord.js";
import { Client } from "discordx";

const client = new Client({
  prefix: "!",
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_VOICE_STATES,
  ],
  classes: [path.join(__dirname, "music", "**/*.cmd.{ts,js}")],
  botGuilds: [process.env.GUILD_ID ?? ""],
  silent: true,
});

client.on("ready", () => {
  client.initApplicationCommands({ log: { forGuild: true, forGlobal: true } });
});

client.on("interactionCreate", (interaction: Interaction) => {
  client.executeInteraction(interaction);
});

client.on("messageCreate", (message: Message) => {
  client.executeCommand(message);
});

client.login(process.env.BOT_TOKEN ?? ""); // provide your bot token
