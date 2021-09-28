import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { StageChannel, TextBasedChannels, VoiceChannel } from "discord.js";
import { Track } from "./track";
import { shuffle } from "./util";
import { subscriptions } from "./music.cmd";

function wait(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

/**
 * A MusicSubscription exists for each active VoiceConnection. Each subscription has its own audio player and queue,
 * and it also attaches logic to the audio player and voice connection for error handling and reconnection logic.
 */
export class MusicSubscription {
  public readonly voiceConnection: VoiceConnection;
  public readonly audioPlayer: AudioPlayer;
  public readonly textChannel: TextBasedChannels;
  public voiceChannel: VoiceChannel | StageChannel;
  public timeoutTimer?: NodeJS.Timeout;
  public idleTimeoutTimer?: NodeJS.Timeout;
  public queue: Track[];
  public queueLock = false;
  public readyLock = false;

  public constructor(
    textChannel: TextBasedChannels,
    voiceChannel: VoiceChannel | StageChannel,
    voiceConnection: VoiceConnection,
    audioPlayer: AudioPlayer
  ) {
    this.textChannel = textChannel;
    this.voiceChannel = voiceChannel;
    this.voiceConnection = voiceConnection;
    this.audioPlayer = audioPlayer;
    this.queue = [];

    this.voiceConnection.on("stateChange", async (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (
          newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
          newState.closeCode === 4014
        ) {
          /*
						If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
						but there is a chance the connection will recover itself if the reason of the disconnect was due to
						switching voice channels. This is also the same code for the bot being kicked from the voice channel,
						so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
						the voice connection.
					*/
          try {
            await entersState(
              this.voiceConnection,
              VoiceConnectionStatus.Connecting,
              5_000
            );
            // Probably moved voice channel
          } catch {
            this.voiceConnection.destroy();
            // Probably removed from voice channel
          }
        } else if (this.voiceConnection.rejoinAttempts < 5) {
          /*
						The disconnect in this case is recoverable, and we also have <5 repeated attempts so we will reconnect.
					*/
          await wait((this.voiceConnection.rejoinAttempts + 1) * 5_000);
          this.voiceConnection.rejoin();
        } else {
          /*
						The disconnect in this case may be recoverable, but we have no more remaining attempts - destroy.
					*/
          this.voiceConnection.destroy();
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        /*
					Once destroyed, stop the subscription
				*/
        this.stop();
      } else if (
        !this.readyLock &&
        (newState.status === VoiceConnectionStatus.Connecting ||
          newState.status === VoiceConnectionStatus.Signalling)
      ) {
        /*
					In the Signalling or Connecting states, we set a 20 second time limit for the connection to become ready
					before destroying the voice connection. This stops the voice connection permanently existing in one of these
					states.
				*/
        this.readyLock = true;
        try {
          await entersState(
            this.voiceConnection,
            VoiceConnectionStatus.Ready,
            20_000
          );
        } catch {
          if (
            this.voiceConnection.state.status !==
            VoiceConnectionStatus.Destroyed
          ) {
            this.voiceConnection.destroy();
          }
        } finally {
          this.readyLock = false;
        }
      }
    });

    // Configure audio player
    this.audioPlayer.on("stateChange", (oldState, newState) => {
      if (
        newState.status === AudioPlayerStatus.Idle &&
        oldState.status !== AudioPlayerStatus.Idle
      ) {
        // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
        // The queue is then processed to start playing the next track, if one is available.
        (oldState.resource as AudioResource<Track>).metadata.onFinish();
        void this.processQueue();
      } else if (newState.status === AudioPlayerStatus.Playing) {
        // If the Playing state has been entered, then a new track has started playback.
        (newState.resource as AudioResource<Track>).metadata.onStart();
      }
    });

    this.audioPlayer.on("error", (error) =>
      (error.resource as AudioResource<Track>).metadata.onError(error)
    );

    voiceConnection.subscribe(this.audioPlayer);
  }

  /**
   * Destruct music before delete
   */
  public delete(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    if (this.idleTimeoutTimer) {
      clearTimeout(this.idleTimeoutTimer);
    }

    if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.voiceConnection.destroy();
    }
  }

  /**
   * Check if voice connection ready
   * @returns
   */
  public isReady(): boolean {
    return this.voiceConnection.state.status === VoiceConnectionStatus.Ready;
  }

  /**
   * Shuffle queue.
   */
  public mix(): void {
    if (this.queue.length < 1) {
      return;
    }
    const shuffled = shuffle(this.queue);
    this.queue = [];
    shuffled.forEach((p) => p && this.queue.push(p));
  }

  /**
   * Adds a new Track to the queue.
   *
   * @param track The track to add to the queue
   */
  public enqueue(track: Track[], top?: boolean): void {
    if (top) {
      this.queue.unshift(...track);
    } else {
      this.queue.push(...track);
    }
    void this.processQueue();
  }

  /**
   * Stops audio playback and empties the queue
   */
  public stop(): void {
    this.queueLock = true;
    this.queue = [];
    this.audioPlayer.stop(true);
  }

  /**
   * Attempts to play a Track from the queue
   */
  private async processQueue(): Promise<void> {
    // If the queue is locked (already being processed), is empty, or the audio player is already playing something, return
    if (
      this.queueLock ||
      this.audioPlayer.state.status !== AudioPlayerStatus.Idle
    ) {
      return;
    }

    if (this.queue.length < 1) {
      this.textChannel.send({
        embeds: [
          {
            title: "Finished playing",
            description:
              "All songs have been played, and if no one wants to hear more, I will leave this voice channel.",
          },
        ],
      });

      if (this.idleTimeoutTimer) {
        clearTimeout(this.idleTimeoutTimer);
      }

      this.idleTimeoutTimer = setTimeout(() => {
        this.idleTimeoutTimer = undefined;
        this.delete();
        subscriptions.delete(this.voiceChannel.guildId);
      }, 5 * 60 * 1000);
    } else {
      if (this.idleTimeoutTimer) {
        clearTimeout(this.idleTimeoutTimer);
      }
    }

    // Lock the queue to guarantee safe access
    this.queueLock = true;

    // Take the first item from the queue. This is guaranteed to exist due to the non-empty check above.
    const nextTrack = this.queue.shift();
    if (!nextTrack) {
      this.queueLock = false;
      return;
    }
    try {
      // Attempt to convert the Track into an AudioResource (i.e. start streaming the video)
      const resource = await nextTrack.createAudioResource();
      this.audioPlayer.play(resource);
      this.queueLock = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // If an error occurred, try the next item of the queue instead
      nextTrack.onError(error);
      this.queueLock = false;
      return this.processQueue();
    }
  }
}
