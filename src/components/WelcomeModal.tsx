import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";

// ===== 首启双通道说明卡（audit-27）=====
// 一次性播种「官网通道 vs API 通道」的核心权衡，看过即写标记不再出现

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function WelcomeModal({ visible, onDismiss }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>欢迎来到 TapMate</Text>
          <Text style={styles.subtitle}>
            连模型有两条路，随时可在「配置」页调整：
          </Text>

          <View style={styles.row}>
            <Text style={styles.rowEmoji}>🌐</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>官网通道 · 免费</Text>
              <Text style={styles.rowSub}>
                登录厂商官网账号，对话在官网页面里进行，用你的订阅额度；消息会帮你复制到剪贴板方便粘贴
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowEmoji}>🔑</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>API 通道 · 按量计费</Text>
              <Text style={styles.rowSub}>
                填 API Key，在统一的对话界面里聊天，支持流式、Markdown
                与本地历史记录
              </Text>
            </View>
          </View>

          <Pressable style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>知道了，去连接一个模型</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: "center",
    padding: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
  },
  emoji: { fontSize: 40, textAlign: "center" },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  row: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  rowEmoji: { fontSize: FONT_SIZE.xl },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZE.md, fontWeight: "700", color: COLORS.text },
  rowSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    marginTop: 2,
    lineHeight: 17,
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  btnText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: "700" },
});
