import {
  ArgsOf,
  Client,
  ContextMenu,
  Discord,
  On,
  SimpleCommand,
  SimpleCommandMessage,
  SimpleCommandOption,
  Slash,
  SlashGroup,
  SlashOption,
} from "discordx";
import {
  CommandInteraction,
  ContextMenuInteraction,
  Snowflake,
} from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import { MusicSubscription } from "./subscription";
import { music } from "./music";

export const subscriptions = new Map<Snowflake, MusicSubscription>();

@Discord()
export class MusicContext {
  @ContextMenu("USER", "Music Skip")
  skipGUI(interaction: ContextMenuInteraction, client: Client): void {
    return music.skip(interaction, client);
  }

  @ContextMenu("USER", "Music Queue")
  queueGUI(interaction: ContextMenuInteraction, client: Client): void {
    return music.queue(interaction, client);
  }

  @ContextMenu("MESSAGE", "Play this song")
  async playGUI(
    interaction: ContextMenuInteraction,
    client: Client
  ): Promise<void> {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    const msg = await interaction.channel.messages.fetch(interaction.targetId);
    if (msg.content.length < 3) {
      interaction.reply({
        embeds: [
          {
            description:
              "Message mentioned above cannot be used to search songs",
          },
        ],
      });
      return;
    }
    return music.play(interaction, client, msg.content);
  }

  @ContextMenu("MESSAGE", "Play playlist")
  async playlistGUI(
    interaction: ContextMenuInteraction,
    client: Client
  ): Promise<void> {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    const msg = await interaction.channel.messages.fetch(interaction.targetId);
    if (msg.content.length < 3) {
      interaction.reply({
        embeds: [
          {
            description:
              "Message mentioned above cannot be used to search playlist",
          },
        ],
      });
      return;
    }
    return music.playlist(interaction, client, msg.content);
  }
}

@Discord()
@SlashGroup("music")
export class MusicCommands {
  @On("voiceStateUpdate")
  voiceUpdate(
    [oldState, newState]: ArgsOf<"voiceStateUpdate">,
    client: Client
  ): void {
    const guildId = newState.guild.id;
    const subscription = subscriptions.get(guildId);
    if (!subscription) {
      return;
    }

    if (
      newState.channel &&
      newState.member?.user.id === client.user?.id &&
      oldState.channelId === subscription.voiceChannel.id &&
      newState.channelId !== subscription.voiceChannel.id
    ) {
      subscription.voiceChannel = newState.channel;
    }

    if (
      oldState.channelId !== subscription.voiceChannel.id &&
      newState.channelId !== subscription.voiceChannel.id
    ) {
      return;
    }

    const totalMembers = subscription.voiceChannel.members.filter(
      (m) => !m.user.bot
    );

    if (
      subscription.audioPlayer.state.status === AudioPlayerStatus.Playing &&
      !totalMembers.size
    ) {
      subscription.audioPlayer.pause();
      subscription.textChannel.send(
        "To save resources, I have paused the queue since everyone has left my voice channel."
      );

      if (subscription.timeoutTimer) {
        clearTimeout(subscription.timeoutTimer);
      }

      subscription.timeoutTimer = setTimeout(() => {
        subscription.textChannel.send(
          "My voice channel has been open for 15 minutes and no one has joined, so the queue has been deleted."
        );
        subscription.delete();
        subscriptions.delete(guildId);
      }, 15 * 60 * 1000);
    } else if (
      subscription.audioPlayer.state.status === AudioPlayerStatus.Paused &&
      totalMembers.size
    ) {
      if (subscription.timeoutTimer) {
        clearTimeout(subscription.timeoutTimer);
        subscription.timeoutTimer = undefined;
      }
      subscription.audioPlayer.unpause();
      subscription.textChannel.send(
        "There has been a new participant in my voice channel, and the queue will be resumed. Enjoy the music 🎶"
      );
    }
  }

  @SimpleCommand("skip", {
    description: "Skip to the next song in the queue",
    argSplitter: "~",
  })
  skipSimple(command: SimpleCommandMessage, client: Client): void {
    music.skip(command.message, client);
  }

  @SimpleCommand("playlist", {
    description: "Play a playlist",
    argSplitter: "~",
  })
  playlistSimple(
    @SimpleCommandOption("search", {
      description: "playlist name",
      type: "STRING",
    })
    songName: string | undefined,
    command: SimpleCommandMessage,
    client: Client
  ): void {
    if (!songName || songName.length < 3) {
      command.sendUsageSyntax();
      return;
    }
    music.playlist(command.message, client, songName);
  }

  @SimpleCommand("play", {
    description: "Play a song",
    argSplitter: "~",
  })
  playSimple(
    @SimpleCommandOption("search", {
      description: "song name",
      type: "STRING",
    })
    songName: string | undefined,
    command: SimpleCommandMessage,
    client: Client
  ): void {
    if (!songName || songName.length < 3) {
      command.sendUsageSyntax();
      return;
    }
    music.play(command.message, client, songName);
  }

  @SimpleCommand("repeat", {
    description: "Reapt currently playing song",
    argSplitter: "~",
  })
  repeatSimple(command: SimpleCommandMessage, client: Client): void {
    music.repeat(command.message, client);
  }

  @SimpleCommand("mix", {
    description: "Randomize queue",
    argSplitter: "~",
  })
  mixSimple(command: SimpleCommandMessage, client: Client): void {
    music.mix(command.message, client);
  }

  @SimpleCommand("queue", {
    description: "See the music queue",
    argSplitter: "~",
  })
  queueSimple(command: SimpleCommandMessage, client: Client): void {
    music.queue(command.message, client);
  }

  @SimpleCommand("pause", {
    description: "Pauses the song that is currently playing",
    argSplitter: "~",
  })
  pauseSimple(command: SimpleCommandMessage, client: Client): void {
    music.pause(command.message, client);
  }

  @SimpleCommand("resume", {
    description: "Resume playback of the current song",
    argSplitter: "~",
  })
  resumeSimple(command: SimpleCommandMessage, client: Client): void {
    music.resume(command.message, client);
  }

  @SimpleCommand("leave", {
    description: "Leave the voice channel",
    argSplitter: "~",
  })
  leaveSimple(command: SimpleCommandMessage, client: Client): void {
    music.leave(command.message, client);
  }

  @Slash("playlist", { description: "Play a playlist" })
  playlist(
    @SlashOption("search", { description: "playlist name", required: true })
    songName: string,
    interaction: CommandInteraction,
    client: Client
  ): void {
    music.playlist(interaction, client, songName);
  }

  @Slash("play", { description: "Play a song" })
  play(
    @SlashOption("song", { description: "song name", required: true })
    songName: string,
    interaction: CommandInteraction,
    client: Client
  ): void {
    music.play(interaction, client, songName);
  }

  @Slash("skip", { description: "Skip to the next song in the queue" })
  skip(interaction: CommandInteraction, client: Client): void {
    music.skip(interaction, client);
  }

  @Slash("repeat", { description: "Reapt currently playing song" })
  repeat(interaction: CommandInteraction, client: Client): void {
    music.repeat(interaction, client);
  }

  @Slash("mix", { description: "Randomize queue" })
  mix(interaction: CommandInteraction, client: Client): void {
    music.mix(interaction, client);
  }

  @Slash("queue", { description: "See the music queue" })
  queue(interaction: CommandInteraction, client: Client): void {
    music.queue(interaction, client);
  }

  @Slash("pause", { description: "Pauses the song that is currently playing" })
  pause(interaction: CommandInteraction, client: Client): void {
    music.pause(interaction, client);
  }

  @Slash("resume", { description: "Resume playback of the current song" })
  resume(interaction: CommandInteraction, client: Client): void {
    music.resume(interaction, client);
  }

  @Slash("leave", { description: "Leave the voice channel" })
  leave(interaction: CommandInteraction, client: Client): void {
    music.leave(interaction, client);
  }
}
