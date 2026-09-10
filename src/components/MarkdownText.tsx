import React from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../constants";

// ===== 轻量 Markdown 渲染器（audit-3）=====
// 零依赖自写：覆盖 AI 回复高频子集——代码块 / 标题 / 有序无序列表 / 引用 / 分割线 /
// 段落内的加粗、斜体、行内代码、链接。未覆盖语法（表格等）按普通段落降级，不会报错。

type Block =
  | { type: "code"; lang?: string; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "p"; text: string };

// 行级块解析：围栏代码 → 标题 → 列表 → 引用 → hr → 段落（连续非空行合并）
function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      flushParagraph();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合围栏（缺失时越界即止）
      blocks.push({
        type: "code",
        lang: fence[1] || undefined,
        text: buf.join("\n"),
      });
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushParagraph();
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join("\n") });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return blocks;
}

// 行内语法：加粗 / 斜体 / 行内代码 / 链接
const INLINE_RE =
  /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last)
      nodes.push(
        <Text key={`${keyPrefix}-t${n}`}>{text.slice(last, m.index)}</Text>,
      );
    const key = `${keyPrefix}-x${n}`;
    if (m[1] !== undefined)
      nodes.push(
        <Text key={key} style={styles.strong}>
          {m[1]}
        </Text>,
      );
    else if (m[2] !== undefined)
      nodes.push(
        <Text key={key} style={styles.em}>
          {m[2]}
        </Text>,
      );
    else if (m[3] !== undefined)
      nodes.push(
        <Text key={key} style={styles.codeChip}>
          {m[3]}
        </Text>,
      );
    else if (m[4] !== undefined) {
      const url = m[5];
      nodes.push(
        <Text
          key={key}
          style={styles.link}
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {m[4]}
        </Text>,
      );
    }
    last = m.index + m[0].length;
    n++;
  }
  if (last < text.length)
    nodes.push(<Text key={`${keyPrefix}-tail${n}`}>{text.slice(last)}</Text>);
  return nodes;
}

export default function MarkdownText({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`;
        switch (b.type) {
          case "code":
            return (
              <View key={key} style={styles.codeBlock}>
                {b.lang ? <Text style={styles.codeLang}>{b.lang}</Text> : null}
                <Text selectable style={styles.codeText}>
                  {b.text || " "}
                </Text>
              </View>
            );
          case "heading":
            return (
              <Text
                key={key}
                selectable
                style={[
                  styles.text,
                  styles[`h${b.level}` as "h1"] ?? styles.h4,
                ]}
              >
                {renderInline(b.text, key)}
              </Text>
            );
          case "ul":
            return (
              <View key={key} style={styles.listBlock}>
                {b.items.map((item, j) => (
                  <Text key={j} selectable style={styles.text}>
                    {"  • "}
                    {renderInline(item, `${key}-${j}`)}
                  </Text>
                ))}
              </View>
            );
          case "ol":
            return (
              <View key={key} style={styles.listBlock}>
                {b.items.map((item, j) => (
                  <Text key={j} selectable style={styles.text}>
                    {`  ${j + 1}. `}
                    {renderInline(item, `${key}-${j}`)}
                  </Text>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={key} style={styles.quote}>
                <Text selectable style={[styles.text, styles.quoteText]}>
                  {renderInline(b.text, key)}
                </Text>
              </View>
            );
          case "hr":
            return <View key={key} style={styles.hr} />;
          default:
            return (
              <Text key={key} selectable style={styles.text}>
                {renderInline(b.text, key)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  text: { fontSize: FONT_SIZE.md, lineHeight: 22, color: COLORS.text },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  link: { color: COLORS.accentDark, textDecorationLine: "underline" },
  codeChip: {
    fontFamily: MONO,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentDark,
    backgroundColor: COLORS.bgAlt,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  codeBlock: {
    backgroundColor: "#2D2D2D",
    borderRadius: RADIUS.xs,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
  },
  codeLang: { color: "#9AA0AC", fontSize: FONT_SIZE.xs, marginBottom: 4 },
  codeText: {
    fontFamily: MONO,
    fontSize: FONT_SIZE.sm,
    lineHeight: 19,
    color: "#E8E6E3",
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.borderSubtle,
    paddingLeft: SPACING.sm,
    marginVertical: SPACING.xs,
  },
  quoteText: { color: COLORS.textSecondary },
  hr: {
    height: 1,
    backgroundColor: COLORS.borderSubtle,
    marginVertical: SPACING.sm,
  },
  listBlock: { gap: 2 },
  h1: { fontSize: FONT_SIZE.lg + 2, fontWeight: "800", marginTop: SPACING.xs },
  h2: { fontSize: FONT_SIZE.lg, fontWeight: "800", marginTop: SPACING.xs },
  h3: { fontSize: FONT_SIZE.md + 1, fontWeight: "700", marginTop: SPACING.xs },
  h4: { fontSize: FONT_SIZE.md, fontWeight: "700" },
});
