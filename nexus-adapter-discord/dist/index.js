#!/usr/bin/env node
import { chunkText, emitStreamStatus, newEvent, runAdapter, sendWithChunking, } from "@nexus-project/adapter-sdk-ts";
import { ChannelType, Client, GatewayIntentBits, Partials, REST, Routes, } from "discord.js";
const DISCORD_TEXT_LIMIT = 2000;
const STREAM_PLACEHOLDER_TEXT = "...";
const STREAM_RENDER_INTERVAL_MS = 300;
const STREAM_RENDER_MIN_DELTA_CHARS = 64;
const DEFAULT_BACKFILL_MAX_MESSAGES_PER_CHANNEL = 500;
function asRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value;
}
function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
function asBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
            return true;
        }
        if (normalized === "false") {
            return false;
        }
    }
    return undefined;
}
function asPositiveInt(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = Math.floor(value);
        return normalized > 0 ? normalized : undefined;
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return undefined;
}
function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => asString(entry))
        .filter((entry) => Boolean(entry));
}
function getDiscordToken(ctx) {
    const runtimeToken = ctx.runtime?.credential?.value?.trim();
    if (runtimeToken) {
        return runtimeToken;
    }
    const envToken = process.env.DISCORD_TOKEN?.trim();
    if (envToken) {
        return envToken;
    }
    throw new Error("missing discord credential (runtime credential or DISCORD_TOKEN)");
}
function parseDiscordTarget(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error("target is required");
    }
    const [prefix, value] = trimmed.split(":", 2);
    if (prefix && value) {
        const normalizedPrefix = prefix.trim().toLowerCase();
        const normalizedValue = value.trim();
        if (!normalizedValue) {
            throw new Error(`invalid target: ${raw}`);
        }
        if (normalizedPrefix === "channel") {
            return { kind: "channel", id: normalizedValue };
        }
        if (normalizedPrefix === "dm") {
            return { kind: "dm", id: normalizedValue };
        }
    }
    return { kind: "channel", id: trimmed };
}
function inferContentType(message) {
    if (message.content.trim()) {
        return "text";
    }
    const first = message.attachments.first();
    const mime = first?.contentType?.toLowerCase() ?? "";
    if (mime.startsWith("image/")) {
        return "image";
    }
    if (mime.startsWith("video/")) {
        return "video";
    }
    if (mime.startsWith("audio/")) {
        return "audio";
    }
    if (first) {
        return "file";
    }
    return "text";
}
function inferContentTypeFromRawMessage(raw) {
    const content = asString(raw.content);
    if (content) {
        return "text";
    }
    const attachments = extractRawAttachments(raw);
    const first = attachments[0];
    const mime = first?.content_type.toLowerCase() ?? "";
    if (mime.startsWith("image/")) {
        return "image";
    }
    if (mime.startsWith("video/")) {
        return "video";
    }
    if (mime.startsWith("audio/")) {
        return "audio";
    }
    if (first) {
        return "file";
    }
    return "text";
}
function normalizeContainer(message) {
    if (message.channel.isThread()) {
        return {
            container_id: message.channel.parentId ?? message.channel.id,
            container_kind: "channel",
            container_name: message.channel.parent?.isTextBased()
                ? ("name" in message.channel.parent ? message.channel.parent.name : undefined)
                : undefined,
            thread_id: message.channel.id,
            thread_name: "name" in message.channel ? message.channel.name : undefined,
        };
    }
    const channelType = message.channel.type;
    if (channelType === ChannelType.DM) {
        return {
            container_id: message.channel.id,
            container_kind: "dm",
        };
    }
    if (channelType === ChannelType.GroupDM) {
        return {
            container_id: message.channel.id,
            container_kind: "group",
            container_name: "name" in message.channel ? message.channel.name ?? undefined : undefined,
        };
    }
    return {
        container_id: message.channel.id,
        container_kind: "channel",
        container_name: "name" in message.channel ? message.channel.name : undefined,
    };
}
function isThreadChannelType(type) {
    return (type === ChannelType.PublicThread ||
        type === ChannelType.PrivateThread ||
        type === ChannelType.AnnouncementThread);
}
function isBackfillableChannelType(type) {
    return (type === ChannelType.DM ||
        type === ChannelType.GroupDM ||
        type === ChannelType.GuildText ||
        type === ChannelType.GuildAnnouncement ||
        isThreadChannelType(type));
}
function normalizeContainerFromChannelRecord(channel, parent) {
    if (isThreadChannelType(channel.type)) {
        return {
            container_id: parent?.id ?? channel.parent_id ?? channel.id,
            container_kind: "channel",
            container_name: parent?.name,
            thread_id: channel.id,
            thread_name: channel.name,
        };
    }
    if (channel.type === ChannelType.DM) {
        return {
            container_id: channel.id,
            container_kind: "dm",
            container_name: channel.name,
        };
    }
    if (channel.type === ChannelType.GroupDM) {
        return {
            container_id: channel.id,
            container_kind: "group",
            container_name: channel.name,
        };
    }
    return {
        container_id: channel.id,
        container_kind: "channel",
        container_name: channel.name,
    };
}
function toDiscordChannelRecord(value) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const id = asString(record.id);
    if (!id) {
        return null;
    }
    const rawType = record.type;
    const type = typeof rawType === "number" && Number.isFinite(rawType) ? Math.floor(rawType) : NaN;
    if (!Number.isFinite(type)) {
        return null;
    }
    const name = asString(record.name);
    const parentID = asString(record.parent_id);
    const guildID = asString(record.guild_id);
    return {
        id,
        type,
        ...(name ? { name } : {}),
        ...(parentID ? { parent_id: parentID } : {}),
        ...(guildID ? { guild_id: guildID } : {}),
    };
}
function extractRawAttachments(raw) {
    const result = [];
    const attachments = raw.attachments;
    if (!Array.isArray(attachments)) {
        return result;
    }
    for (const attachment of attachments) {
        const record = asRecord(attachment);
        if (!record) {
            continue;
        }
        const id = asString(record.id);
        if (!id) {
            continue;
        }
        const filename = asString(record.filename) ?? id;
        const contentType = asString(record.content_type) ?? "application/octet-stream";
        const size = typeof record.size === "number" && Number.isFinite(record.size) && record.size >= 0
            ? Math.floor(record.size)
            : undefined;
        const url = asString(record.url);
        result.push({
            id,
            filename,
            content_type: contentType,
            ...(typeof size === "number" ? { size_bytes: size } : {}),
            ...(url ? { url } : {}),
        });
    }
    return result;
}
function parseRawMessageTimestamp(raw) {
    const timestamp = asString(raw.timestamp);
    if (timestamp) {
        const parsed = Date.parse(timestamp);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    const rawID = asString(raw.id);
    if (!rawID) {
        return null;
    }
    try {
        const epoch = (BigInt(rawID) >> 22n) + 1420070400000n;
        const value = Number(epoch);
        return Number.isFinite(value) ? value : null;
    }
    catch {
        return null;
    }
}
function parseRawReplyToID(raw) {
    const directRef = asRecord(raw.message_reference);
    if (directRef) {
        const direct = asString(directRef.message_id);
        if (direct) {
            return direct;
        }
    }
    const referencedMessage = asRecord(raw.referenced_message);
    if (referencedMessage) {
        const referenced = asString(referencedMessage.id);
        if (referenced) {
            return referenced;
        }
    }
    return undefined;
}
function parseRawMentionsBot(raw, selfID) {
    if (!selfID) {
        return false;
    }
    const mentions = raw.mentions;
    if (!Array.isArray(mentions)) {
        return false;
    }
    for (const mention of mentions) {
        const mentionRecord = asRecord(mention);
        if (!mentionRecord) {
            continue;
        }
        if (asString(mentionRecord.id) === selfID) {
            return true;
        }
    }
    return false;
}
function parseRawMessage(raw, selfID) {
    const record = asRecord(raw);
    if (!record) {
        return null;
    }
    const id = asString(record.id);
    if (!id) {
        return null;
    }
    const timestampMs = parseRawMessageTimestamp(record);
    if (timestampMs === null) {
        return null;
    }
    const attachments = extractRawAttachments(record);
    const contentType = inferContentTypeFromRawMessage(record);
    const rawContent = typeof record.content === "string" ? record.content.trim() : "";
    const content = rawContent ||
        (contentType === "text"
            ? "(no content)"
            : attachments.length > 0
                ? `[${attachments.length} attachment(s)]`
                : "(no content)");
    const author = asRecord(record.author);
    const member = asRecord(record.member);
    const senderID = asString(author?.id) ?? "unknown";
    const senderName = asString(member?.nick) ?? asString(author?.global_name) ?? asString(author?.username);
    const authorIsBot = asBoolean(author?.bot) ?? false;
    const replyToID = parseRawReplyToID(record);
    return {
        id,
        timestamp_ms: timestampMs,
        content,
        content_type: contentType,
        sender_id: senderID,
        ...(senderName ? { sender_name: senderName } : {}),
        ...(replyToID ? { reply_to_id: replyToID } : {}),
        attachments,
        mentions_bot: parseRawMentionsBot(record, selfID),
        author_is_bot: authorIsBot,
    };
}
function restClient(token) {
    return new REST({ version: "10" }).setToken(token);
}
async function resolveSendChannelID(rest, reqTo, threadID) {
    const requestedThread = threadID?.trim();
    if (requestedThread) {
        return requestedThread;
    }
    const target = parseDiscordTarget(reqTo);
    if (target.kind === "channel") {
        return target.id;
    }
    const dm = (await rest.post(Routes.userChannels(), {
        body: { recipient_id: target.id },
    }));
    const channelID = dm.id?.trim();
    if (!channelID) {
        throw new Error("discord did not return a DM channel id");
    }
    return channelID;
}
async function createDiscordMessage(rest, channelID, text, replyToID) {
    const body = { content: text };
    if (replyToID?.trim()) {
        body.message_reference = {
            message_id: replyToID.trim(),
            fail_if_not_exists: false,
        };
    }
    const response = (await rest.post(Routes.channelMessages(channelID), {
        body,
    }));
    const messageID = response.id?.trim();
    if (!messageID) {
        throw new Error("discord did not return a message id");
    }
    return messageID;
}
async function editDiscordMessage(rest, channelID, messageID, text) {
    await rest.patch(Routes.channelMessage(channelID, messageID), {
        body: { content: text },
    });
}
async function sendDiscordText(rest, channelID, text, replyToID) {
    let firstChunk = true;
    return await sendWithChunking(text, DISCORD_TEXT_LIMIT, async (chunk) => {
        const body = { content: chunk };
        if (firstChunk && replyToID?.trim()) {
            body.message_reference = {
                message_id: replyToID.trim(),
                fail_if_not_exists: false,
            };
        }
        const response = (await rest.post(Routes.channelMessages(channelID), {
            body,
        }));
        firstChunk = false;
        return response.id?.trim() || `discord:sent:${Date.now()}`;
    });
}
function renderStreamChunks(text) {
    if (!text.length) {
        return [STREAM_PLACEHOLDER_TEXT];
    }
    const chunks = chunkText(text, DISCORD_TEXT_LIMIT).filter((chunk) => chunk.length > 0);
    return chunks.length > 0 ? chunks : [STREAM_PLACEHOLDER_TEXT];
}
async function renderDiscordStreamState(params) {
    const now = Date.now();
    const deltaChars = Math.abs(params.state.full_text.length - params.state.rendered_chars);
    if (!params.force &&
        now - params.state.last_render_at < STREAM_RENDER_INTERVAL_MS &&
        deltaChars < STREAM_RENDER_MIN_DELTA_CHARS) {
        return;
    }
    const chunks = renderStreamChunks(params.state.full_text);
    for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx] ?? "";
        const existingMessageID = params.state.message_ids[idx];
        const existingChunk = params.state.rendered_chunks[idx];
        if (existingMessageID) {
            if (existingChunk !== chunk) {
                await editDiscordMessage(params.rest, params.state.channel_id, existingMessageID, chunk);
                emitStreamStatus({
                    type: "message_updated",
                    messageId: existingMessageID,
                    chars: params.state.full_text.length,
                });
            }
            continue;
        }
        const createdID = await createDiscordMessage(params.rest, params.state.channel_id, chunk, idx === 0 ? params.state.reply_to_id : undefined);
        params.state.message_ids.push(createdID);
        params.state.rendered_chunks.push(chunk);
        emitStreamStatus({
            type: "message_created",
            messageId: createdID,
        });
    }
    params.state.rendered_chunks = chunks;
    params.state.last_render_at = now;
    params.state.rendered_chars = params.state.full_text.length;
}
function collectConfiguredBackfillChannelIDs(config) {
    const channelIDs = new Set();
    const addValues = (values) => {
        for (const value of values) {
            if (value !== "*") {
                channelIDs.add(value);
            }
        }
    };
    if (config) {
        addValues(asStringArray(config.backfill_channels));
        addValues(asStringArray(config.backfill_container_ids));
        addValues(asStringArray(config.channels));
        addValues(asStringArray(config.container_ids));
    }
    const backfillConfig = asRecord(config?.backfill);
    if (backfillConfig) {
        addValues(asStringArray(backfillConfig.channels));
        addValues(asStringArray(backfillConfig.channel_ids));
        addValues(asStringArray(backfillConfig.container_ids));
    }
    const guilds = asRecord(config?.guilds);
    if (guilds) {
        for (const guildEntry of Object.values(guilds)) {
            const guildRecord = asRecord(guildEntry);
            if (!guildRecord) {
                continue;
            }
            const channels = asRecord(guildRecord.channels);
            if (!channels) {
                continue;
            }
            for (const key of Object.keys(channels)) {
                const trimmed = key.trim();
                if (trimmed && trimmed !== "*") {
                    channelIDs.add(trimmed);
                }
            }
        }
    }
    return [...channelIDs];
}
function resolveBackfillOptions(ctx) {
    const config = asRecord(ctx.runtime?.config);
    const backfillConfig = asRecord(config?.backfill);
    const channelIDs = collectConfiguredBackfillChannelIDs(config);
    const maxMessages = asPositiveInt(backfillConfig?.max_messages_per_channel) ??
        asPositiveInt(config?.backfill_max_messages_per_channel) ??
        DEFAULT_BACKFILL_MAX_MESSAGES_PER_CHANNEL;
    const includeBots = asBoolean(backfillConfig?.include_bots) ?? asBoolean(config?.backfill_include_bots) ?? false;
    const autodiscover = asBoolean(backfillConfig?.autodiscover_guild_channels) ??
        asBoolean(config?.backfill_autodiscover_guild_channels) ??
        false;
    return {
        channel_ids: channelIDs,
        max_messages_per_channel: maxMessages,
        include_bots: includeBots,
        autodiscover_guild_channels: autodiscover,
    };
}
async function fetchSelfUserID(rest) {
    const me = (await rest.get(Routes.user()));
    return me.id?.trim() ?? "";
}
async function discoverGuildChannelIDs(rest, ctx) {
    const discovered = new Set();
    const guilds = (await rest.get(Routes.userGuilds()));
    if (!Array.isArray(guilds)) {
        return [];
    }
    for (const guild of guilds) {
        const guildRecord = asRecord(guild);
        const guildID = asString(guildRecord?.id);
        if (!guildID) {
            continue;
        }
        try {
            const channels = (await rest.get(Routes.guildChannels(guildID)));
            if (!Array.isArray(channels)) {
                continue;
            }
            for (const channel of channels) {
                const normalized = toDiscordChannelRecord(channel);
                if (!normalized || !isBackfillableChannelType(normalized.type)) {
                    continue;
                }
                discovered.add(normalized.id);
            }
        }
        catch (error) {
            ctx.log.info("discord backfill: guild discovery failed guild=%s err=%s", guildID, error instanceof Error ? error.message : String(error));
        }
    }
    return [...discovered];
}
async function getChannelRecord(rest, channelID, cache) {
    const existing = cache.get(channelID);
    if (existing) {
        return existing;
    }
    const raw = (await rest.get(Routes.channel(channelID)));
    const parsed = toDiscordChannelRecord(raw);
    if (parsed) {
        cache.set(channelID, parsed);
    }
    return parsed;
}
async function getGuildName(rest, guildID, cache) {
    const existing = cache.get(guildID);
    if (existing) {
        return existing;
    }
    const raw = (await rest.get(Routes.guild(guildID)));
    const record = asRecord(raw);
    const name = asString(record?.name);
    if (name) {
        cache.set(guildID, name);
    }
    return name;
}
function buildBackfillEvent(params) {
    const builder = newEvent("discord", `discord:${params.parsed_message.id}`)
        .withTimestampUnixMs(params.parsed_message.timestamp_ms)
        .withContent(params.parsed_message.content)
        .withContentType(params.parsed_message.content_type)
        .withSender(params.parsed_message.sender_id, params.parsed_message.sender_name)
        .withContainer(params.normalized_container.container_id, params.normalized_container.container_kind)
        .withAccount(params.account_id)
        .withMetadata("message_id", params.parsed_message.id)
        .withMetadata("channel_id", params.source_channel_id)
        .withMetadata("guild_id", params.space_id ?? null)
        .withMetadata("mentions_bot", params.parsed_message.mentions_bot)
        .withMetadata("author_is_bot", params.parsed_message.author_is_bot)
        .withMetadata("backfill", true);
    if (params.normalized_container.thread_id) {
        builder.withThread(params.normalized_container.thread_id);
    }
    if (params.parsed_message.reply_to_id) {
        builder.withReplyTo(params.parsed_message.reply_to_id);
    }
    for (const attachment of params.parsed_message.attachments) {
        builder.withAttachment(attachment);
    }
    const event = builder.build();
    if (params.space_id) {
        event.space_id = params.space_id;
    }
    if (params.space_name) {
        event.space_name = params.space_name;
    }
    if (params.normalized_container.container_name) {
        event.container_name = params.normalized_container.container_name;
    }
    if (params.normalized_container.thread_name) {
        event.thread_name = params.normalized_container.thread_name;
    }
    return event;
}
async function backfillChannelMessages(params) {
    let emitted = 0;
    let before;
    while (!params.ctx.signal.aborted && emitted < params.max_messages) {
        const limit = Math.min(100, params.max_messages - emitted);
        const query = new URLSearchParams();
        query.set("limit", String(limit));
        if (before) {
            query.set("before", before);
        }
        const rawBatch = (await params.rest.get(Routes.channelMessages(params.channel_id), {
            query,
        }));
        if (!Array.isArray(rawBatch) || rawBatch.length === 0) {
            break;
        }
        const parsedBatch = rawBatch
            .map((entry) => parseRawMessage(entry, params.self_id))
            .filter((parsed) => Boolean(parsed));
        if (parsedBatch.length === 0) {
            break;
        }
        const newestTimestamp = parsedBatch.reduce((acc, entry) => Math.max(acc, entry.timestamp_ms), Number.NEGATIVE_INFINITY);
        parsedBatch.sort((left, right) => left.timestamp_ms - right.timestamp_ms);
        for (const parsed of parsedBatch) {
            if (parsed.timestamp_ms < params.since_ms) {
                continue;
            }
            if (!params.include_bots && parsed.author_is_bot) {
                continue;
            }
            const event = buildBackfillEvent({
                account_id: params.account_id,
                parsed_message: parsed,
                normalized_container: params.normalized_container,
                source_channel_id: params.channel_id,
                ...(params.space_id ? { space_id: params.space_id } : {}),
                ...(params.space_name ? { space_name: params.space_name } : {}),
            });
            params.emit(event);
            emitted += 1;
            if (emitted >= params.max_messages) {
                break;
            }
        }
        if (newestTimestamp < params.since_ms) {
            break;
        }
        const oldestRecord = asRecord(rawBatch[rawBatch.length - 1]);
        const oldestID = asString(oldestRecord?.id);
        if (!oldestID) {
            break;
        }
        before = oldestID;
        if (rawBatch.length < limit) {
            break;
        }
    }
    return emitted;
}
let activeStream = null;
let activeStreamRest = null;
const discordStreamHandlers = {
    onStart: async (ctx, event) => {
        if (activeStream) {
            throw new Error("discord stream overlap detected: previous stream is still active");
        }
        const token = getDiscordToken(ctx);
        const rest = restClient(token);
        const channelID = await resolveSendChannelID(rest, event.target.to, event.target.thread_id);
        const replyToID = event.target.reply_to_id?.trim();
        const createdID = await createDiscordMessage(rest, channelID, STREAM_PLACEHOLDER_TEXT, replyToID);
        emitStreamStatus({
            type: "message_created",
            messageId: createdID,
        });
        activeStream = {
            run_id: event.runId,
            channel_id: channelID,
            ...(replyToID ? { reply_to_id: replyToID } : {}),
            full_text: "",
            rendered_chunks: [STREAM_PLACEHOLDER_TEXT],
            message_ids: [createdID],
            last_render_at: Date.now(),
            rendered_chars: 0,
        };
        activeStreamRest = rest;
    },
    onToken: async (_ctx, event) => {
        if (!activeStream || !activeStreamRest) {
            throw new Error("discord stream received token before stream_start");
        }
        activeStream.full_text += event.text;
        await renderDiscordStreamState({
            rest: activeStreamRest,
            state: activeStream,
            force: false,
        });
    },
    onReasoning: async () => {
        // Intentionally ignored for delivery text.
    },
    onToolStatus: async () => {
        // Intentionally ignored for delivery text.
    },
    onEnd: async (_ctx, event) => {
        if (!activeStream || !activeStreamRest) {
            throw new Error("discord stream received stream_end before stream_start");
        }
        if (event.runId !== activeStream.run_id) {
            throw new Error(`discord stream run mismatch: expected ${activeStream.run_id}, got ${event.runId}`);
        }
        if (!activeStream.full_text.trim()) {
            activeStream.full_text = "(no content)";
        }
        await renderDiscordStreamState({
            rest: activeStreamRest,
            state: activeStream,
            force: true,
        });
        const finalMessageID = activeStream.message_ids[activeStream.message_ids.length - 1] ?? activeStream.message_ids[0];
        if (finalMessageID) {
            emitStreamStatus({
                type: "message_sent",
                messageId: finalMessageID,
                final: true,
            });
        }
        emitStreamStatus({
            type: "delivery_complete",
            messageIds: [...activeStream.message_ids],
        });
        activeStream = null;
        activeStreamRest = null;
    },
    onError: async (_ctx, event) => {
        if (activeStream && activeStreamRest && !activeStream.full_text.trim()) {
            activeStream.full_text = "(delivery failed)";
            try {
                await renderDiscordStreamState({
                    rest: activeStreamRest,
                    state: activeStream,
                    force: true,
                });
            }
            catch {
                // Ignore best-effort stream finalization errors.
            }
        }
        emitStreamStatus({
            type: "delivery_error",
            error: event.error || "discord stream error",
        });
        activeStream = null;
        activeStreamRest = null;
    },
};
await runAdapter({
    info: async () => ({
        channel: "discord",
        name: "nexus-discord-adapter",
        version: "0.1.0",
        supports: ["monitor", "send", "stream", "backfill", "health", "accounts"],
        credential_service: "discord",
        multi_account: true,
        channel_capabilities: {
            text_limit: DISCORD_TEXT_LIMIT,
            supports_markdown: true,
            markdown_flavor: "discord",
            supports_tables: false,
            supports_code_blocks: true,
            supports_embeds: true,
            supports_threads: true,
            supports_reactions: true,
            supports_polls: false,
            supports_buttons: false,
            supports_edit: true,
            supports_delete: false,
            supports_media: false,
            supports_voice_notes: false,
            supports_streaming_edit: true,
        },
    }),
    accounts: async (ctx) => {
        const accountID = ctx.runtime?.account_id?.trim() || "default";
        return [
            {
                id: accountID,
                display_name: accountID,
                credential_ref: `discord/${accountID}`,
                status: "ready",
            },
        ];
    },
    health: async (ctx, args) => {
        try {
            const token = getDiscordToken(ctx);
            const rest = restClient(token);
            const me = (await rest.get(Routes.user()));
            return {
                connected: Boolean(me.id),
                account: args.account,
                last_event_at: Date.now(),
                details: {
                    user_id: me.id ?? null,
                    username: me.username ?? null,
                },
            };
        }
        catch (error) {
            return {
                connected: false,
                account: args.account,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    backfill: async (ctx, args, emit) => {
        const token = getDiscordToken(ctx);
        const rest = restClient(token);
        const selfID = await fetchSelfUserID(rest);
        const options = resolveBackfillOptions(ctx);
        let channelIDs = [...options.channel_ids];
        if (channelIDs.length === 0 && options.autodiscover_guild_channels) {
            channelIDs = await discoverGuildChannelIDs(rest, ctx);
        }
        if (channelIDs.length === 0) {
            ctx.log.info("discord backfill: no containers configured (set backfill.channels/backfill_channels or enable autodiscover_guild_channels)");
            return;
        }
        const sinceMs = args.since.getTime();
        const channelCache = new Map();
        const guildNameCache = new Map();
        let totalEmitted = 0;
        for (const channelID of channelIDs) {
            if (ctx.signal.aborted) {
                break;
            }
            try {
                const channel = await getChannelRecord(rest, channelID, channelCache);
                if (!channel) {
                    ctx.log.info("discord backfill: failed to load channel %s", channelID);
                    continue;
                }
                if (!isBackfillableChannelType(channel.type)) {
                    ctx.log.debug("discord backfill: skipping unsupported channel type channel=%s type=%d", channel.id, channel.type);
                    continue;
                }
                const parent = channel.parent_id && isThreadChannelType(channel.type)
                    ? await getChannelRecord(rest, channel.parent_id, channelCache)
                    : null;
                const normalizedContainer = normalizeContainerFromChannelRecord(channel, parent ?? undefined);
                const spaceID = channel.guild_id ?? parent?.guild_id;
                const spaceName = spaceID ? await getGuildName(rest, spaceID, guildNameCache) : undefined;
                const emitted = await backfillChannelMessages({
                    ctx,
                    rest,
                    emit,
                    account_id: args.account,
                    channel_id: channel.id,
                    normalized_container: normalizedContainer,
                    ...(spaceID ? { space_id: spaceID } : {}),
                    ...(spaceName ? { space_name: spaceName } : {}),
                    since_ms: sinceMs,
                    max_messages: options.max_messages_per_channel,
                    include_bots: options.include_bots,
                    self_id: selfID,
                });
                totalEmitted += emitted;
            }
            catch (error) {
                ctx.log.info("discord backfill failed channel=%s err=%s", channelID, error instanceof Error ? error.message : String(error));
            }
        }
        ctx.log.info("discord backfill emitted %d event(s)", totalEmitted);
    },
    send: async (ctx, req) => {
        if (req.media?.trim()) {
            return {
                success: false,
                message_ids: [],
                chunks_sent: 0,
                error: {
                    type: "content_rejected",
                    message: "media send is not implemented in this adapter yet",
                    retry: false,
                },
            };
        }
        const text = req.text?.trim();
        if (!text) {
            return {
                success: false,
                message_ids: [],
                chunks_sent: 0,
                error: {
                    type: "content_rejected",
                    message: "message text is required",
                    retry: false,
                },
            };
        }
        try {
            const token = getDiscordToken(ctx);
            const rest = restClient(token);
            const channelID = await resolveSendChannelID(rest, req.to, req.thread_id);
            return await sendDiscordText(rest, channelID, text, req.reply_to_id);
        }
        catch (error) {
            return {
                success: false,
                message_ids: [],
                chunks_sent: 0,
                error: {
                    type: "network",
                    message: error instanceof Error ? error.message : String(error),
                    retry: true,
                },
            };
        }
    },
    monitor: async (ctx, args, emit) => {
        const token = getDiscordToken(ctx);
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel],
        });
        let selfID = "";
        client.on("ready", () => {
            selfID = client.user?.id ?? "";
            ctx.log.info("discord monitor connected account=%s bot_id=%s", JSON.stringify(args.account), JSON.stringify(selfID));
        });
        client.on("messageCreate", (message) => {
            if (message.author?.id && message.author.id === selfID) {
                return;
            }
            const container = normalizeContainer(message);
            const contentType = inferContentType(message);
            const fallbackContent = contentType === "text"
                ? "(no content)"
                : message.attachments.size > 0
                    ? `[${message.attachments.size} attachment(s)]`
                    : "(no content)";
            const content = message.content.trim() || fallbackContent;
            const replyToID = message.reference?.messageId ?? undefined;
            const builder = newEvent("discord", `discord:${message.id}`)
                .withTimestamp(message.createdAt)
                .withContent(content)
                .withContentType(contentType)
                .withSender(message.author?.id ?? "unknown", message.member?.displayName ?? message.author?.displayName ?? message.author?.username)
                .withContainer(container.container_id, container.container_kind)
                .withAccount(args.account)
                .withMetadata("message_id", message.id)
                .withMetadata("channel_id", message.channel.id)
                .withMetadata("guild_id", message.guildId ?? null)
                .withMetadata("mentions_bot", selfID ? message.mentions.users.has(selfID) : false)
                .withMetadata("author_is_bot", Boolean(message.author?.bot));
            if (container.thread_id) {
                builder.withThread(container.thread_id);
            }
            if (replyToID) {
                builder.withReplyTo(replyToID);
            }
            for (const attachment of message.attachments.values()) {
                builder.withAttachment({
                    id: attachment.id,
                    filename: attachment.name ?? attachment.id,
                    content_type: attachment.contentType ?? "application/octet-stream",
                    ...(typeof attachment.size === "number" ? { size_bytes: attachment.size } : {}),
                    ...(attachment.url ? { url: attachment.url } : {}),
                });
            }
            const event = builder.build();
            event.space_id = message.guildId ?? undefined;
            event.space_name = message.guild?.name ?? undefined;
            event.container_name = container.container_name;
            event.thread_name = container.thread_name;
            emit(event);
        });
        await client.login(token);
        await new Promise((resolve) => {
            const onAbort = () => resolve();
            if (ctx.signal.aborted) {
                resolve();
                return;
            }
            ctx.signal.addEventListener("abort", onAbort, { once: true });
        });
        await client.destroy();
    },
    stream: discordStreamHandlers,
});
