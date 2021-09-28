import {
  AudioPlayerStatus,
  AudioResource,
  DiscordGatewayAdapterCreator,
  VoiceConnectionStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  CommandInteraction,
  ContextMenuInteraction,
  GuildMember,
  Message,
  MessageEmbed,
} from "discord.js";
import { Client } from "discordx";
import { MusicSubscription } from "./subscription";
import { Track } from "./track";
import { sendPaginatedEmbeds } from "@discordx/utilities";
import { subscriptions } from "./music.cmd";
import ytpl from "ytpl";
import ytsr from "ytsr";

export class music {
  static repeat(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (
      !subscription ||
      !subscription.isReady() ||
      subscription.audioPlayer.state.status !== AudioPlayerStatus.Playing
    ) {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
      return;
    }

    const track = (
      subscription.audioPlayer.state.resource as AudioResource<Track>
    ).metadata;

    subscription.enqueue([track], true);
    const embed = new MessageEmbed();
    embed.setTitle("Repeated");
    embed.setDescription(`${track.title}`);
    interaction.reply({ embeds: [embed] });
  }

  static resume(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (!subscription || !subscription.isReady()) {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
      return;
    }

    if (subscription.audioPlayer.state.status === AudioPlayerStatus.Paused) {
      subscription.audioPlayer.unpause();
      interaction.reply({ content: "> Resumed!" });
    } else {
      interaction.reply({ content: "> Already playing!", ephemeral: true });
    }
  }

  static leave(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (subscription?.isReady()) {
      subscription.delete();
      subscriptions.delete(interaction.guildId);
      interaction.reply({ content: "> Left channel!" });
    } else {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
    }
  }

  static skip(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (!subscription || !subscription.isReady()) {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
      return;
    }

    if (subscription.audioPlayer.state.status === AudioPlayerStatus.Playing) {
      subscription.audioPlayer.stop();
      interaction.reply("> Skipped song!");
    } else {
      interaction.reply("> Music is currently paused!");
    }
  }

  static mix(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (!subscription) {
      interaction.reply("Sorry, can't randomize at the moment!");
      return;
    }
    subscription.mix();
    interaction.reply("> queue mixed!");
  }

  static queue(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);
    if (!subscription || !subscription.isReady()) {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
      return;
    }

    if (subscription.audioPlayer.state.status !== AudioPlayerStatus.Playing) {
      interaction.reply({
        content: "> Nothing is currently playing!",
        ephemeral: true,
      });
      return;
    }

    if (!subscription.queue.length) {
      interaction.reply(
        `> Playing **${
          (subscription.audioPlayer.state.resource as AudioResource<Track>)
            .metadata.title
        }**`
      );
      return;
    }

    const current = `> Playing **${
      (subscription.audioPlayer.state.resource as AudioResource<Track>).metadata
        .title
    }** out of ${subscription.queue.length + 1}`;

    const pages: string[] = [];
    for (let index = 0; index < subscription.queue.length; index += 10) {
      const queue = subscription.queue
        .slice(index, index + 10)
        .map((track, sindex) => `${index + sindex + 1}. ${track.title}`)
        .join("\n");
      pages.push(`${current}\n\`\`\`${queue}\`\`\``);
    }
    if (pages.length < 1) {
      interaction.reply(
        pages[0] ?? "> queue missing, it went to mars instead earth"
      );
      return;
    } else {
      sendPaginatedEmbeds(interaction, pages, {
        type: pages.length <= 5 ? "BUTTON" : "SELECT_MENU",
        time: 2 * 60 * 1000,
      });
    }
  }

  static pause(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client
  ): void {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const subscription = subscriptions.get(interaction.guildId);

    if (!subscription || !subscription.isReady()) {
      interaction.reply({
        content: "> Not playing in this server!",
        ephemeral: true,
      });
      return;
    }

    if (subscription.audioPlayer.state.status === AudioPlayerStatus.Playing) {
      subscription.audioPlayer.pause();
      interaction.reply({ content: "> Paused!" });
    } else {
      interaction.reply({ content: "> Already paused!", ephemeral: true });
    }
  }

  static async playlist(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client,
    searchText: string
  ): Promise<void> {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const member = interaction.member as GuildMember;
    let subscription = subscriptions.get(interaction.guildId);
    const isMessage = interaction instanceof Message;
    if (!isMessage) {
      await interaction.deferReply();
    }

    const allFilters = await ytsr.getFilters(searchText);
    const playlistFilter = allFilters.get("Type")?.get("Playlist");
    if (!playlistFilter || !playlistFilter.url) {
      const embed = new MessageEmbed();
      embed.setTitle("Not found");
      embed.setDescription(
        `${member}, couldn't obtain the search result for video.`
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    const result = await ytsr(playlistFilter.url, { limit: 1 });
    const playlistData = result.items[0];
    if (!playlistData || playlistData.type !== "playlist") {
      const embed = new MessageEmbed();
      embed.setTitle("Not found");
      embed.setDescription(
        `${member}, couldn't obtain the search result for video.`
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    const playlist = await ytpl(playlistData.playlistID);
    if (!playlist.items.length) {
      const embed = new MessageEmbed();
      embed.setTitle("Not found");
      embed.setDescription(
        `${member}, couldn't obtain the search result for video.`
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    // delete subscription if voice connection is destroyed
    if (
      subscription &&
      subscription.voiceConnection.state.status ===
        VoiceConnectionStatus.Destroyed
    ) {
      subscription.delete();
      subscriptions.delete(interaction.guildId);
      subscription = undefined;
    }

    // If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
    // and create a subscription.
    if (!subscription && member.voice.channel) {
      const channel = member.voice.channel;
      subscription = new MusicSubscription(
        interaction.channel,
        member.voice.channel,
        joinVoiceChannel({
          group: client.botId,
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild
            .voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        }),
        createAudioPlayer()
      );
      subscription.voiceConnection.on("error", console.warn);
      subscriptions.set(interaction.guildId, subscription);
    }

    // If there is no subscription, tell the user they need to join a channel.
    if (!subscription) {
      const embed = new MessageEmbed();
      embed.setTitle("Missing voice chanel");
      embed.setDescription("Join a voice channel and then try that again!");
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    // Make sure the connection is ready before processing the user's request
    try {
      await entersState(
        subscription.voiceConnection,
        VoiceConnectionStatus.Ready,
        20e3
      );
    } catch (error) {
      console.warn(error);

      const embed = new MessageEmbed();
      embed.setTitle("Error");
      embed.setDescription(
        "Failed to join voice channel within 20 seconds, please try again later!"
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    const tracks = playlist.items.map((song) => {
      const url = `https://www.youtube.com/watch?v=${song.id}`;
      // Attempt to create a Track from the user's video URL
      return Track.from(
        {
          title: song.title,
          url,
        },
        {
          onStart() {
            interaction.channel?.send(`> Playing ${song.url}`);
          },
          onFinish() {
            const embed = new MessageEmbed();
            embed.setTitle("Finished");
            embed.setDescription(`${song.title}`);
            embed.setURL(song.url);
            embed.setAuthor(
              member.nickname ?? member.user.username,
              member.user.avatarURL() ?? undefined
            );
            interaction.channel?.send({ embeds: [embed] });
          },
          onError(error) {
            console.warn(error);
            const embed = new MessageEmbed();
            embed.setTitle("Error");
            embed.setDescription("Could not play");
            embed.addField("Error Message", `${error?.message}`);
            interaction.channel?.send({ embeds: [embed] });
          },
        }
      );
      // Enqueue the track and reply a success message to the user
    });
    subscription.enqueue(tracks);
    const embed = new MessageEmbed();
    embed.setTitle("Enqueued");
    embed.setDescription(
      `Enqueued song **${playlist.title}** with songs **${playlist.items.length}**`
    );
    isMessage
      ? interaction.reply({ embeds: [embed] })
      : interaction.followUp({ embeds: [embed] });
  }

  static async play(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    client: Client,
    searchText: string
  ): Promise<void> {
    if (!interaction.guildId || !interaction.channel) {
      return;
    }
    if (
      interaction.channel.id !== "503920562888769536" &&
      interaction.guildId === "475742959585722408"
    ) {
      interaction.reply(
        "> Music commands work only in <#503920562888769536> channel"
      );
      return;
    }
    const member = interaction.member as GuildMember;
    let subscription = subscriptions.get(interaction.guildId);
    const isMessage = interaction instanceof Message;
    if (!isMessage) {
      await interaction.deferReply();
    }

    const filters = await ytsr.getFilters(searchText);
    const search = filters.get("Type")?.get("Video");
    if (!search || !search.url) {
      const embed = new MessageEmbed();
      embed.setTitle("Not found");
      embed.setDescription(
        `${member}, couldn't obtain the search result for video.`
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    const result = await ytsr(search.url, { limit: 1 });
    if (result.items.length < 1 || result.items[0]?.type !== "video") {
      const embed = new MessageEmbed();
      embed.setTitle("Not found");
      embed.setDescription(
        `${member}, couldn't obtain the search result for video.`
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    // Extract the video URL from the command
    const song = result.items[0];

    // delete subscription if voice connection is destroyed
    if (
      subscription &&
      subscription.voiceConnection.state.status ===
        VoiceConnectionStatus.Destroyed
    ) {
      subscription.delete();
      subscriptions.delete(interaction.guildId);
      subscription = undefined;
    }

    // If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
    // and create a subscription.
    if (!subscription && member.voice.channel) {
      const channel = member.voice.channel;
      subscription = new MusicSubscription(
        interaction.channel,
        member.voice.channel,
        joinVoiceChannel({
          group: client.botId,
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild
            .voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        }),
        createAudioPlayer()
      );
      subscription.voiceConnection.on("error", console.warn);
      subscriptions.set(interaction.guildId, subscription);
    }

    // If there is no subscription, tell the user they need to join a channel.
    if (!subscription) {
      const embed = new MessageEmbed();
      embed.setTitle("Missing voice chanel");
      embed.setDescription("Join a voice channel and then try that again!");
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    // Make sure the connection is ready before processing the user's request
    try {
      await entersState(
        subscription.voiceConnection,
        VoiceConnectionStatus.Ready,
        20e3
      );
    } catch (error) {
      console.warn(error);
      const embed = new MessageEmbed();
      embed.setTitle("Error");
      embed.setDescription(
        "Failed to join voice channel within 20 seconds, please try again later!"
      );
      isMessage
        ? interaction.reply({ embeds: [embed] })
        : interaction.followUp({ embeds: [embed] });
      return;
    }

    // Attempt to create a Track from the user's video URL
    const url = `https://www.youtube.com/watch?v=${song.id}`;
    const track = Track.from(
      { title: song.title, url },
      {
        onStart() {
          interaction.channel?.send(`> Playing ${song.url}`);
        },
        onFinish() {
          const embed = new MessageEmbed();
          embed.setTitle("Finished");
          embed.setDescription(`${song.title}`);
          embed.setURL(song.url);
          embed.setAuthor(
            member.nickname ?? member.user.username,
            member.user.avatarURL() ?? undefined
          );
          interaction.channel?.send({ embeds: [embed] });
        },
        onError(error) {
          console.warn(error);
          const embed = new MessageEmbed();
          embed.setTitle("Error");
          embed.setDescription("Could not play");
          embed.addField("Error Message", `${error?.message}`);
          interaction.channel?.send({ embeds: [embed] });
        },
      }
    );
    // Enqueue the track and reply a success message to the user
    subscription.enqueue([track]);
    const embed = new MessageEmbed();
    embed.setTitle("Enqueued");
    embed.setDescription(`Enqueued song **${track.title}****`);
    isMessage
      ? interaction.reply({ embeds: [embed] })
      : interaction.followUp({ embeds: [embed] });
  }
}
