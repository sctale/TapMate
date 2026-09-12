import React, { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";
import { getProvider } from "../providers/registry";
import MarkdownText from "./MarkdownText";
import type { ChatMessage } from "../types";

// 单条消息气泡：用户右对齐靛蓝，模型左对齐白卡（Markdown 渲染）
// thinking=生成中占位动效（audit-1）；error=警示态样式（audit-21）；长按=复制/重试动作入口（audit-17）
// tagged=对比会话模型标签；reasoning=推理模型思考过程折叠块（v0.3.0）
interface Props {
  msg: ChatMessage;
  thinking?: boolean; // 该气泡为流式生成中的空占位
  tagged?: boolean; // 显示 厂商·模型 标签（对比会话）
  onRetry?: (msg: ChatMessage) => void; // 错误态内联重试（v0.4.3）
  onLongPress?: (msg: ChatMessage) => void;
}

const MessageBubble = memo(function MessageBubble({
  msg,
  thinking,
  tagged,
  onRetry,
  onLongPress,
}: Props) {
  const isUser = msg.role === "user";
  const [showR, setShowR] = useState(false);
  const hasReasoning = msg.role === "assistant" && !!msg.reasoning;
  // 推理进行中（还没有正文）时自动展开，让用户看到模型在"想什么"
  const reasoningOpen = showR || (thinking === true && !msg.content);
  const provider = msg.providerId ? getProvider(msg.providerId) : undefined;

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
      <Pressable
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAi,
          !!msg.error && styles.bubbleError,
        ]}
        onLongPress={onLongPress ? () => onLongPress(msg) : undefined}
        delayLongPress={350}
      >
        {tagged && !isUser && msg.modelId ? (
          <Text style={styles.tag} numberOfLines={1}>
            {provider?.emoji ?? "🤖"} {provider?.name ?? msg.providerId} ·{" "}
            {msg.modelId}
          </Text>
        ) : null}
        {hasReasoning ? (
          <View style={styles.reasonWrap}>
            <Pressable
              style={styles.reasonHead}
              onPress={() => setShowR((v) => !v)}
            >
              <Text style={styles.reasonHeadText}>
                💭 思考过程 {reasoningOpen ? "▴" : "▾"}
              </Text>
            </Pressable>
            {reasoningOpen ? (
              <ScrollView
                style={styles.reasonBody}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.reasonText}>{msg.reasoning}</Text>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
        {thinking && !msg.content ? (
          hasReasoning ? null : (
            <ThinkingDots />
          )
        ) : isUser ? (
          <Text style={[styles.text, styles.textUser]} selectable>
            {msg.content}
          </Text>
        ) : msg.content ? (
          <MarkdownText source={msg.content} />
        ) : (
          <ThinkingDots />
        )}
        {msg.error ? <Text style={styles.error}>⚠️ {msg.error}</Text> : null}
        {msg.error && onRetry ? (
          <Pressable
            style={styles.retryBtn}
            onPress={() => onRetry(msg)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.retryBtnText}>🔁 重试</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
});

export default MessageBubble;

// 三个错峰跳动的小圆点：assistant 占位气泡的空内容态
function ThinkingDots() {
  return (
    <View style={styles.thinkingRow}>
      <BounceDot delay={0} />
      <BounceDot delay={160} />
      <BounceDot delay={320} />
      <Text style={styles.thinkingText}>正在思考…</Text>
    </View>
  );
}

function BounceDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 320,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -3],
              }),
            },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  rowUser: { justifyContent: "flex-end" },
  rowAi: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  bubbleUser: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: RADIUS.xs,
  },
  bubbleAi: {
    backgroundColor: COLORS.aiBubble,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: RADIUS.xs,
  },
  bubbleError: {
    borderColor: COLORS.danger,
    borderLeftWidth: 3,
    backgroundColor: "#FDF1F1",
  },
  text: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
  },
  textUser: { color: COLORS.userBubbleText },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  thinkingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    marginLeft: SPACING.xs,
  },
  error: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontWeight: "600",
  },
  retryBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.danger,
  },
  retryBtnText: { color: "#fff", fontSize: FONT_SIZE.xs, fontWeight: "700" },
  tag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    fontWeight: "700",
    marginBottom: 4,
  },
  reasonWrap: {
    marginBottom: SPACING.xs,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.bgAlt,
    overflow: "hidden",
  },
  reasonHead: { paddingVertical: 7, paddingHorizontal: SPACING.sm },
  reasonHeadText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  reasonBody: {
    maxHeight: 180,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  reasonText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    lineHeight: 18,
  },
});
