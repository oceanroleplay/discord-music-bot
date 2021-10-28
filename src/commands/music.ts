import {
  Client,
  CommandInteraction,
  ContextMenuInteraction,
  Guild,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextBasedChannels,
} from "discord.js";
import { Pagination, PaginationResolver } from "@discordx/utilities";
import { Player, Queue } from "@discordx/music";

export class MyQueue extends Queue {
  lastControlMessage?: Message;
  timeoutTimer?: NodeJS.Timeout;
  lockUpdate = false;

  constructor(
    player: Player,
    guild: Guild,
    public channel?: TextBasedChannels
  ) {
    super(player, guild);
    // empty constructor
  }

  controlsRow(): MessageActionRow[] {
    const nextButton = new MessageButton()
      .setLabel("Next")
      .setEmoji("⏭")
      .setStyle("PRIMARY")
      .setDisabled(!this.isPlaying)
      .setCustomId("btn-next");
    const pauseButton = new MessageButton()
      .setLabel(this.isPlaying ? "Pause" : "Resume")
      .setEmoji("⏯")
      .setStyle("PRIMARY")
      .setCustomId("btn-pause");
    const stopButton = new MessageButton()
      .setLabel("Stop")
      .setDisabled(!this.isPlaying)
      .setStyle("DANGER")
      .setCustomId("btn-leave");
    const repeatButton = new MessageButton()
      .setLabel("Repeat")
      .setEmoji("🔂")
      .setDisabled(!this.isPlaying)
      .setStyle("PRIMARY")
      .setCustomId("btn-repeat");

    const row1 = new MessageActionRow().addComponents(
      stopButton,
      pauseButton,
      nextButton,
      repeatButton
    );

    const queueButton = new MessageButton()
      .setLabel("Queue")
      .setEmoji("🎵")
      .setStyle("PRIMARY")
      .setCustomId("btn-queue");
    const mixButton = new MessageButton()
      .setLabel("Shuffle")
      .setEmoji("🎛️")
      .setDisabled(!this.isPlaying)
      .setStyle("PRIMARY")
      .setCustomId("btn-mix");
    const controlsButton = new MessageButton()
      .setLabel("Controls")
      .setEmoji("🔄")
      .setStyle("PRIMARY")
      .setCustomId("btn-controls");

    const row2 = new MessageActionRow().addComponents(
      queueButton,
      mixButton,
      controlsButton
    );
    return [row1, row2];
  }

  public async updateControlMessage(options?: {
    force?: boolean;
    text?: string;
  }): Promise<void> {
    if (this.lockUpdate) {
      return;
    }
    this.lockUpdate = true;
    const embed = new MessageEmbed();
    embed.setTitle("Music Controls");
    const currentTrack = this.currentTrack;
    const nextTrack = this.nextTrack;
    if (currentTrack) {
      embed.addField(
        "Now Playing" +
          (this.size > 2 ? ` (Total: ${this.size} songs queued)` : ""),
        `[${currentTrack.metadata.title}](${
          currentTrack.metadata.url ?? "NaN"
        })`
      );

      if (
        currentTrack.metadata.isYoutubeTrack() &&
        currentTrack.metadata.info.bestThumbnail.url
      ) {
        embed.setThumbnail(currentTrack.metadata.info.bestThumbnail.url);
      }

      const user = currentTrack.metadata.isYoutubeTrack()
        ? currentTrack.metadata.options?.user
        : currentTrack.metadata?.user;

      if (user) {
        embed.addField("Played by", `${user}`);
      }

      embed.addField(
        "Next Song",
        nextTrack
          ? `[${nextTrack.title}](${nextTrack.url})`
          : "No upcoming song"
      );
    } else {
      embed.setDescription("music player is currently paused");
    }

    const pMsg = {
      content: options?.text,
      embeds: [embed],
      components: [...this.controlsRow()],
    };

    if (!this.isReady && this.lastControlMessage) {
      await this.lastControlMessage.delete();
      this.lastControlMessage = undefined;
      this.lockUpdate = false;
      return;
    }

    try {
      if (!this.lastControlMessage || options?.force) {
        if (this.lastControlMessage) {
          await this.lastControlMessage.delete();
          this.lastControlMessage = undefined;
        }
        this.lastControlMessage = await this.channel?.send(pMsg);
      } else {
        await this.lastControlMessage.edit(pMsg);
      }
    } catch (err) {
      // ignore
      console.log(err);
    }

    this.lockUpdate = false;
  }

  async view(
    interaction: Message | CommandInteraction | ContextMenuInteraction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    client: Client
  ): Promise<void> {
    const currentTrack = this.currentTrack;
    if (!this.isReady || !currentTrack) {
      const pMsg = await interaction.reply({
        content: "> could not process queue atm, try later!",
        ephemeral: true,
      });
      if (pMsg instanceof Message) {
        setTimeout(() => pMsg.delete(), 3000);
      }
      return;
    }

    if (!this.size) {
      const pMsg = await interaction.reply(
        `> Playing **${currentTrack.metadata.title}**`
      );
      if (pMsg instanceof Message) {
        setTimeout(() => pMsg.delete(), 10_000);
      }
      return;
    }

    const current = `> Playing **${currentTrack.metadata.title}** out of ${
      this.size + 1
    }`;

    const pageOptions = new PaginationResolver((index, paginator) => {
      paginator.maxLength = this.size / 10;
      if (index > paginator.maxLength) {
        paginator.currentPage = 0;
      }

      const currentPage = paginator.currentPage;

      const queue = this.tracks
        .slice(currentPage * 10, currentPage * 10 + 10)
        .map(
          (track, sindex) => `${currentPage * 10 + sindex + 1}. ${track.title}`
        )
        .join("\n\n");

      return `${current}\n\`\`\`markdown\n${queue}\`\`\``;
    }, Math.round(this.size / 10));

    await new Pagination(interaction, pageOptions, {
      onPaginationTimeout: (index, message) => {
        if (message.deletable) {
          message.delete();
        }
      },
      type: Math.round(this.size / 10) <= 5 ? "BUTTON" : "SELECT_MENU",
      time: 6e4,
    }).send();
  }
}

export class MyPlayer extends Player {
  constructor() {
    super();

    this.on<MyQueue, "onStart">("onStart", ([queue]) => {
      queue.updateControlMessage({ force: true });
    });

    this.on<MyQueue, "onFinishPlayback">("onFinishPlayback", ([queue]) => {
      queue.updateControlMessage({
        force: true,
        text: "All songs have been played",
      });
    });

    this.on<MyQueue, "onPause">("onPause", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onResume">("onResume", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onError">("onError", ([queue, err]) => {
      queue.updateControlMessage({
        force: true,
        text: `Error: ${err.message}`,
      });
    });

    this.on<MyQueue, "onFinish">("onFinish", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoop">("onLoop", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeat">("onRepeat", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onSkip">("onSkip", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onTrackAdd">("onTrackAdd", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoopEnabled">("onLoopEnabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLoopDisabled">("onLoopDisabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeatEnabled">("onRepeatEnabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onRepeatDisabled">("onRepeatDisabled", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onMix">("onMix", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onVolumeUpdate">("onVolumeUpdate", ([queue]) => {
      queue.updateControlMessage();
    });

    this.on<MyQueue, "onLeave">("onLeave", ([queue]) => {
      setTimeout(() => {
        queue.updateControlMessage();
      }, 5e3);
    });
  }

  getQueue(guild: Guild, channel?: TextBasedChannels): MyQueue {
    return super.queue<MyQueue>(guild, new MyQueue(this, guild, channel));
  }
}
