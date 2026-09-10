import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../constants';
import type { ChatMessage } from '../types';

// 单条消息气泡：用户右对齐靛蓝，模型左对齐白卡
export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAi]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAi]}>
          {msg.content}
        </Text>
        {msg.error ? <Text style={styles.error}>⚠️ {msg.error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
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
  text: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
  },
  textUser: { color: COLORS.userBubbleText },
  textAi: { color: COLORS.text },
  error: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
  },
});
