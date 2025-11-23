// Load variables from .env file
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
} = require('@discordjs/voice');

// ================== IFE TRACKS (LOCAL FILES IN ./audio) ==================
const TRACKS = {
  new_boarding: {
    label: 'Boarding – New Music',
    description: 'Emirates new boarding music.',
    file: 'emirates new boarding music.mp3',
  },
  old_boarding: {
    label: 'Boarding – Old Music',
    description: 'Emirates old boarding music.',
    file: 'emirates old boarding music.mp3',
  },
  safety_generic: {
    label: 'Safety – Generic',
    description: 'Generic Emirates safety video music.',
    file: 'emirates safety video music.mp3',
  },
  safety_a350: {
    label: 'Safety – A350',
    description: 'Emirates A350 safety video audio.',
    file: 'emirates a350 safety video.mp3',
  },
  safety_a380: {
    label: 'Safety – A380',
    description: 'Emirates A380 safety video audio.',
    file: 'emirates a380 safety video.mp3',
  },
  safety_b777: {
    label: 'Safety – Boeing 777',
    description: 'Emirates Boeing 777 safety video audio.',
    file: 'emirates boeing 777 safety video.mp3',
  },
  welcome_ice: {
    label: 'Welcome Onboard – ICE',
    description: 'Standard ICE welcome onboard announcement.',
    file: 'welcome onboard ice.mp3',
  },
  welcome_ice_old: {
    label: 'Welcome Onboard – ICE (Old)',
    description: 'Legacy ICE welcome onboard announcement.',
    file: 'welcome onboard ice old.mp3',
  },
  welcome_dubai: {
    label: 'Welcome to Dubai',
    description: 'Arrival welcome to Dubai.',
    file: 'welcome to dubai.mp3',
  },
  i_want_to_fly_world: {
    label: 'I Want to Fly the World',
    description: '“I want to fly the world” music.',
    file: 'i want to fly the world music.mp3',
  },
};

const TRACK_ORDER = Object.keys(TRACKS);

// ================== DISCORD CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
});

// Global audio player + connection (IFE)
const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Play,
  },
});

let voiceConnection = null;
let currentTrackKey = null;
let isPaused = false;

player.on('error', (error) => {
  console.error('🔴 Audio player error:', error.message);
});

player.on(AudioPlayerStatus.Idle, () => {
  if (currentTrackKey) {
    console.log(`⏹️ Finished: ${TRACKS[currentTrackKey].label}`);
  }
});

// ================== HELPERS ==================

async function connectToStage(guildId, channelId) {
  if (!guildId || !channelId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const stageChannel = await guild.channels.fetch(channelId);

    if (
      !stageChannel ||
      (stageChannel.type !== ChannelType.GuildStageVoice &&
        stageChannel.type !== ChannelType.GuildVoice)
    ) {
      console.log('⚠️ STAGE_CHANNEL_ID is not a Stage/Voice channel.');
      return;
    }

    voiceConnection = joinVoiceChannel({
      channelId: stageChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    voiceConnection.subscribe(player);
    console.log(`🎧 Connected to stage/voice channel: ${stageChannel.name}`);

    try {
      const me = await guild.members.fetch(client.user.id);
      if (me.voice && me.voice.suppress) {
        await me.voice.setSuppressed(false);
        console.log('🎙️ Bot unsuppressed in Stage channel.');
      }
    } catch (err) {
      console.log('⚠️ Could not unsuppress in Stage channel:', err.message);
    }
  } catch (err) {
    console.error('❌ Error connecting to stage:', err);
  }
}

function buildIFEDashboardEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('Emirates Group Roblox – IFE Audio Control')
    .setDescription(
      currentTrackKey
        ? `🎵 **Now Playing:** ${TRACKS[currentTrackKey].label}\n_${TRACKS[currentTrackKey].description}_`
        : 'No audio is currently playing.'
    )
    .setColor(0x4b3f72)
    .setFooter({ text: 'Cabin Crew Only • Technology Systems Division' });

  const options = Object.entries(TRACKS).map(([value, track]) => ({
    label: track.label,
    description: track.description,
    value,
  }));

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ife_select')
      .setPlaceholder('Select in-flight audio to play...')
      .addOptions(options)
  );

  const controlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ife_play_pause')
      .setLabel(isPaused ? 'Play' : 'Pause')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(isPaused ? '▶️' : '⏸️'),
    new ButtonBuilder()
      .setCustomId('ife_stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹️')
  );

  return { embed, components: [selectRow, controlsRow] };
}

async function sendIFEDashboard(channel) {
  const { embed, components } = buildIFEDashboardEmbed();
  await channel.send({ embeds: [embed], components });
  console.log(`📺 IFE Control Panel sent in #${channel.name}`);
}

function playTrack(key) {
  const track = TRACKS[key];
  if (!track) {
    console.log('⚠️ Tried to play unknown track key:', key);
    return;
  }
  if (!voiceConnection) {
    console.log('⚠️ No voice connection; cannot play track.');
    return;
  }

  const filePath = path.join(__dirname, 'audio', track.file);
  const resource = createAudioResource(filePath);

  currentTrackKey = key;
  isPaused = false;
  player.play(resource);

  console.log(`▶️ Now playing: ${track.label} (${track.file})`);
}

// ----- Verification panel helpers -----
function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle('Emirates Airlines (Unified) — Verification')
    .setDescription(
      'Welcome to the **Emirates Airlines (Unified)** Discord server.\n\n' +
        'To access passenger and operations channels, you must confirm that you understand and accept our community guidelines and virtual operations policy.\n\n' +
        'Click **Verify** to continue. If you need help, click **Contact Support**.'
    )
    .setColor(0xd81e05)
    .setFooter({
      text: 'Emirates Group Roblox • This is a virtual experience, not affiliated with Emirates or the Emirates Group.',
    });
}

function buildVerifyComponents() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('unified_verify_button')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setLabel('Contact Support')
      .setStyle(ButtonStyle.Link)
      .setURL('https://emiratesgrouproblox.link/support')
  );
  return [row];
}

async function safeDMById(userId, options) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(options);
    return true;
  } catch (err) {
    console.error(`❌ Failed to DM ${userId}:`, err.message);
    return false;
  }
}

// Build Date object in Dubai time (UTC+4) from date + "HH:MM"
function buildDubaiDate(dateStr, timeStr) {
  // Example dateStr "2025-11-23", timeStr "18:00"
  return new Date(Date.parse(`${dateStr}T${timeStr}:00+04:00`));
}

// ================== DISCORD EVENTS ==================

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Emirates Group Roblox Official Bot online as ${c.user.tag}`);

  // Auto-connect to IFE stage/voice if configured
  if (process.env.GUILD_ID && process.env.STAGE_CHANNEL_ID) {
    await connectToStage(process.env.GUILD_ID, process.env.STAGE_CHANNEL_ID);
  }

  // NOTE: We do NOT auto-send IFE panel or verification panel here anymore.
  // They are only sent when you run the setup commands in Discord.
});

// --- Text commands ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  // Simple health check
  if (content === '!ping') {
    return message.reply(
      '🛡️ **Emirates Group Roblox Bot Online**\nAll core systems are operational.'
    );
  }

  if (content === '!egr') {
    return message.reply(
      '✈️ **Emirates Group Roblox**\n' +
        'Official organization services and systems.\n\n' +
        '**Website:** https://emiratesgrouproblox.link\n' +
        '**Status:** This bot is operated by the Emirates Group Roblox Technology Systems Division.'
    );
  }

  // Admin-only: setup IFE panel (main IFE guild)
  if (content === '!setupife') {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply('⚠️ You must be an administrator to run this command.');
    }

    if (!process.env.CONTROL_CHANNEL_ID) {
      return message.reply(
        '⚠️ CONTROL_CHANNEL_ID is not configured in `.env`.'
      );
    }

    if (message.channel.id !== process.env.CONTROL_CHANNEL_ID) {
      return message.reply(
        `⚠️ Please run this command in <#${process.env.CONTROL_CHANNEL_ID}>.`
      );
    }

    await sendIFEDashboard(message.channel);
    return;
  }

  // Admin-only: setup verification panel (Unified server)
  if (content === '!setupverify') {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply('⚠️ You must be an administrator to run this command.');
    }

    if (!process.env.UNIFIED_GUILD_ID || !process.env.UNIFIED_VERIFIED_ROLE_ID) {
      return message.reply(
        '⚠️ Unified verification env vars are not configured in `.env`.'
      );
    }

    if (message.guild.id !== process.env.UNIFIED_GUILD_ID) {
      return message.reply(
        '⚠️ This command can only be used in the Emirates Airlines (Unified) server.'
      );
    }

    const embed = buildVerifyEmbed();
    const components = buildVerifyComponents();
    await message.channel.send({ embeds: [embed], components });
    return;
  }
});

// --- Interaction handler (IFE + verification) ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // IFE dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'ife_select') {
      const selected = interaction.values[0];

      if (!voiceConnection) {
        return interaction.reply({
          content:
            '⚠️ I am not connected to the Stage channel. Please restart the bot or contact IT.',
          flags: 1 << 6, // ephemeral replacement
        });
      }

      playTrack(selected);

      const { embed, components } = buildIFEDashboardEmbed();
      return interaction.update({ embeds: [embed], components });
    }

    // Buttons
    if (interaction.isButton()) {
      // IFE buttons
      if (interaction.customId === 'ife_play_pause' || interaction.customId === 'ife_stop') {
        if (!voiceConnection) {
          return interaction.reply({
            content:
              '⚠️ I am not connected to the Stage channel. Please restart the bot or contact IT.',
            flags: 1 << 6,
          });
        }

        if (interaction.customId === 'ife_play_pause') {
          if (!currentTrackKey) {
            return interaction.reply({
              content:
                '⚠️ No track is currently selected. Please pick one from the menu.',
              flags: 1 << 6,
            });
          }

          if (isPaused) {
            player.unpause();
            isPaused = false;
          } else {
            player.pause();
            isPaused = true;
          }

          const { embed, components } = buildIFEDashboardEmbed();
          return interaction.update({ embeds: [embed], components });
        }

        if (interaction.customId === 'ife_stop') {
          player.stop();
          currentTrackKey = null;
          isPaused = false;
          const { embed, components } = buildIFEDashboardEmbed();
          return interaction.update({ embeds: [embed], components });
        }
      }

      // Verification button for Emirates Airlines (Unified)
      if (interaction.customId === 'unified_verify_button') {
        if (!process.env.UNIFIED_GUILD_ID || !process.env.UNIFIED_VERIFIED_ROLE_ID) {
          return interaction.reply({
            content:
              '⚠️ Verification is not fully configured. Please contact a server administrator.',
            flags: 1 << 6,
          });
        }

        if (!interaction.inGuild()) {
          return interaction.reply({
            content: '⚠️ Please use this button inside the server.',
            flags: 1 << 6,
          });
        }

        if (interaction.guildId !== process.env.UNIFIED_GUILD_ID) {
          return interaction.reply({
            content:
              '⚠️ This verification button is not valid for this server.',
            flags: 1 << 6,
          });
        }

        const roleId = process.env.UNIFIED_VERIFIED_ROLE_ID;
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(roleId)) {
          return interaction.reply({
            content: '✅ You are already verified for Emirates Airlines (Unified).',
            flags: 1 << 6,
          });
        }

        try {
          await member.roles.add(roleId);
          return interaction.reply({
            content:
              '✅ You have been verified and granted access to Emirates Airlines (Unified) channels.\n\nWelcome onboard.',
            flags: 1 << 6,
          });
        } catch (err) {
          console.error('Error adding verification role:', err);
          return interaction.reply({
            content:
              '❌ I was unable to grant your verification role. Please contact a member of staff.',
            flags: 1 << 6,
          });
        }
      }
    }
  } catch (err) {
    console.error('🔴 Interaction handler error:', err);
    if (!interaction.replied && !interaction.deferred) {
      interaction
        .reply({
          content:
            '❌ An unexpected error occurred while handling this action. Please try again or contact IT.',
          flags: 1 << 6,
        })
        .catch(() => {});
    }
  }
});

// ================== EXPRESS API (BOOKING / CHECK-IN / FLIGHTS) ==================
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: [
      'https://flyemirates.emiratesgrouproblox.link',
      'https://flightdashboard.emiratesgrouproblox.link',
    ],
  })
);

// ---- POST /api/booking -> DM booking receipt ----
app.post('/api/booking', async (req, res) => {
  const {
    bookingRef,
    simulator,
    cabin,
    from,
    to,
    date,
    timeOfDay,
    paxCount,
    primaryDiscord,
    primaryDiscordId,
  } = req.body || {};

  if (!bookingRef || !primaryDiscord || !primaryDiscordId) {
    return res.status(400).json({
      ok: false,
      error: 'Missing bookingRef, primaryDiscord or primaryDiscordId',
    });
  }

  const route = `${from || 'Unknown'} → ${to || 'Unknown'}`;

  const embed = new EmbedBuilder()
    .setTitle('Emirates Airlines (Unified) — Booking Confirmation')
    .setDescription(
      'Thank you for creating a booking with **Emirates Airlines (Unified)**.\n\n' +
        'Your booking details are summarised below.'
    )
    .setColor(0xd81e05)
    .addFields(
      { name: 'Booking reference', value: `\`${bookingRef}\``, inline: true },
      { name: 'Simulator', value: simulator || 'Not specified', inline: true },
      { name: 'Cabin', value: cabin || 'Not specified', inline: true },
      { name: 'Route', value: route, inline: false },
      {
        name: 'Preferred date / time',
        value: `${date || 'Not specified'} • ${timeOfDay || 'Any'}`,
        inline: false,
      },
      {
        name: 'Passengers',
        value: String(paxCount || 1),
        inline: true,
      },
      {
        name: 'Primary contact',
        value: `Discord: \`${primaryDiscord}\`\nID: \`${primaryDiscordId}\``,
        inline: false,
      }
    )
    .setFooter({
      text: 'Emirates Group Roblox • Booking system',
    })
    .setTimestamp();

  const dmSuccess = await safeDMById(primaryDiscordId, {
    content:
      '🧾 **Your Emirates Airlines (Unified) booking has been received.**\n\n' +
      'Please keep this reference safe — you will need it for online check-in.',
    embeds: [embed],
  });

  if (!dmSuccess) {
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to send DM to primary contact.' });
  }

  return res.json({ ok: true });
});

// ---- POST /api/checkin -> DM check-in confirmation ----
app.post('/api/checkin', async (req, res) => {
  const {
    bookingRef,
    simulator,
    cabin,
    from,
    to,
    date,
    roblox,
    discordUser,
    discordId,
    seatPreference,
    baggage,
    checkinType,
  } = req.body || {};

  if (!bookingRef || !roblox || !discordUser || !discordId) {
    return res.status(400).json({
      ok: false,
      error: 'Missing bookingRef, roblox, discordUser or discordId',
    });
  }

  const route = `${from || 'Unknown'} → ${to || 'Unknown'}`;

  const embed = new EmbedBuilder()
    .setTitle('Emirates Airlines (Unified) — Online Check-in Confirmed')
    .setDescription(
      `Your online check-in request for booking \`${bookingRef}\` has been received.\n\n` +
        'A member of our team will validate your details and provide gate / server information on Discord.'
    )
    .setColor(0xd81e05)
    .addFields(
      { name: 'Booking reference', value: `\`${bookingRef}\``, inline: true },
      { name: 'Simulator', value: simulator || 'Not specified', inline: true },
      { name: 'Cabin', value: cabin || 'Not specified', inline: true },
      { name: 'Route', value: route, inline: false },
      { name: 'Flight date', value: date || 'Not specified', inline: true },
      {
        name: 'Check-in type',
        value: checkinType || 'Standard',
        inline: true,
      },
      {
        name: 'Passenger',
        value: `Roblox: \`${roblox}\`\nDiscord: \`${discordUser}\`\nID: \`${discordId}\``,
        inline: false,
      },
      {
        name: 'Preferences',
        value:
          `Seat: ${seatPreference || 'Any available'}\n` +
          `Baggage: ${baggage || 'Not specified'}`,
        inline: false,
      }
    )
    .setFooter({
      text: 'Emirates Group Roblox • Online Check-in system',
    })
    .setTimestamp();

  const dmSuccess = await safeDMById(discordId, {
    content:
      '🛄 **Your online check-in has been submitted.**\n\nPlease monitor your Discord for further instructions from our staff.',
    embeds: [embed],
  });

  if (!dmSuccess) {
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to send DM to passenger.' });
  }

  return res.json({ ok: true });
});

// ---- POST /api/flights/create -> create scheduled event ----
app.post('/api/flights/create', async (req, res) => {
  const flight = req.body || {};
  const {
    date,
    flightNumber,
    airline,
    aircraft,
    simulator,
    from,
    to,
    depTime,
    arrTime,
    status,
    gate,
    remarks,
  } = flight;

  if (!date || !flightNumber || !from || !to || !depTime) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required flight fields.',
    });
  }

  if (!client.isReady()) {
    return res
      .status(503)
      .json({ ok: false, error: 'Bot is not ready to create events.' });
  }

  if (!process.env.UNIFIED_GUILD_ID) {
    return res
      .status(500)
      .json({ ok: false, error: 'UNIFIED_GUILD_ID is not configured.' });
  }

  try {
    const guild = await client.guilds.fetch(process.env.UNIFIED_GUILD_ID);

    const depDate = buildDubaiDate(date, depTime);
    const arrDate = arrTime
      ? buildDubaiDate(date, arrTime)
      : new Date(depDate.getTime() + 2 * 3600000);
    const checkInOpen = new Date(depDate.getTime() - 20 * 60000);

    // Extract codes like "(DXB)" if present
    const codeRegex = /\(([A-Z0-9]{3,4})\)/;
    const fromMatch = (from || '').match(codeRegex);
    const toMatch = (to || '').match(codeRegex);
    const fromCode = fromMatch ? fromMatch[1] : from;
    const toCode = toMatch ? toMatch[1] : to;

    const eventName = `${fromCode} → ${toCode}`;

    const descriptionLines = [
      `**Flight:** ${flightNumber}`,
      `**Airline:** ${airline || 'Emirates Airlines (Unified)'}`,
      `**Route:** ${from} → ${to}`,
      '',
      `**Departure (Dubai / GMT+4):** ${depTime} on ${date}`,
      `**Check-in opens:** ${checkInOpen.toTimeString().slice(0, 5)} (Dubai time)`,
      `**Estimated arrival:** ${arrTime || 'TBA'} (Dubai time)`,
      '',
      `**Aircraft:** ${aircraft || 'TBA'}`,
      `**Simulator:** ${simulator || 'TBA'}`,
      `**Gate / stand:** ${gate || 'TBA'}`,
      '',
      `**Status:** ${status || 'Scheduled'}`,
    ];

    if (remarks) {
      descriptionLines.push('', `**Remarks:** ${remarks}`);
    }

    descriptionLines.push(
      '',
      '_This is a virtual flight operated by Emirates Group Roblox. Not affiliated with, sponsored by or endorsed by Emirates or the Emirates Group._'
    );

    const event = await guild.scheduledEvents.create({
      name: eventName,
      scheduledStartTime: checkInOpen,
      scheduledEndTime: depDate,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: {
        location: 'Emirates Airlines (Unified) — Flight Operations',
      },
      description: descriptionLines.join('\n'),
    });

    console.log(
      `📅 Created scheduled event ${event.name} (${event.id}) for flight ${flightNumber}`
    );

    return res.json({ ok: true, eventId: event.id });
  } catch (err) {
    console.error('❌ Error creating scheduled event:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Failed to create Discord event.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Bot API listening on port ${PORT}`);
});

// ================== LOGIN ==================
client.login(process.env.DISCORD_TOKEN);
