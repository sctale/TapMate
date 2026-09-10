import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";

// ===== 全局轻提示（audit-12）=====
// 各屏统一反馈通道：useToast 拿 show + <ToastView/>，替代此前只有配置页能 toast 的局面

export function useToast(bottomOffset: number = SPACING.xxl) {
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, duration = 2500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => {
      setMessage("");
      timerRef.current = null;
    }, duration);
  }, []);

  const node = message ? (
    <View style={[styles.toast, { bottom: bottomOffset }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  ) : null;

  return { show, node };
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    zIndex: 50,
  },
  toastText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
