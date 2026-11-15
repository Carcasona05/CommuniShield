import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { bucketSentiments, sentimentBucketLabel, smoothSentimentSeries } from "../../services/sentimentOverview";

export default function SentimentTrendChart({ trend }) {
  const buckets = trend.buckets;
  const [plotWidth, setPlotWidth] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tooltipHeight, setTooltipHeight] = useState(126);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const tooltipReveal = useRef(new Animated.Value(0)).current;
  const inspected = buckets[selected];
  const inspectedCount = inspected ? bucketSentiments(inspected).reduce((sum, row) => sum + row.count, 0) : 0;
  const series = useMemo(() => smoothSentimentSeries(buckets), [buckets]);
  const tooltipVisible = Boolean(inspected);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => {
    reveal.stopAnimation();
    if (reduceMotion) { reveal.setValue(1); return; }
    reveal.setValue(0);
    const animation = Animated.timing(reveal, { toValue: 1, duration: 550, useNativeDriver: Platform.OS !== "web" });
    animation.start();
    return () => animation.stop();
  }, [series, reduceMotion, reveal]);
  useEffect(() => {
    tooltipReveal.stopAnimation();
    if (reduceMotion) { tooltipReveal.setValue(tooltipVisible ? 1 : 0); return; }
    if (!tooltipVisible) { tooltipReveal.setValue(0); return; }
    const animation = Animated.timing(tooltipReveal, { toValue: 1, duration: 140, useNativeDriver: Platform.OS !== "web" });
    animation.start();
    return () => animation.stop();
  }, [tooltipVisible, reduceMotion, tooltipReveal]);
  const tooltipWidth = Math.min(180, Math.max(0, plotWidth - 8));
  const point = series.flatMap(segment => segment.points).find(item => item.index === selected);
  const tooltipLeft = Math.max(4, Math.min(plotWidth - tooltipWidth - 4, (selected + 0.5) / Math.max(1, buckets.length) * plotWidth - tooltipWidth / 2));
  const pointY = point?.y ?? 100;
  const tooltipTop = Math.max(4, Math.min(200 - tooltipHeight - 4, pointY > 100 ? pointY - tooltipHeight - 12 : pointY + 12));
  const tickCount = Math.min(plotWidth < 260 ? 3 : 6, buckets.length);
  const tickIndices = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (buckets.length - 1) / Math.max(1, tickCount - 1))))];
  return <View style={s.card} testID="sentiment-trend-chart">
    <View style={s.heading}><Text style={s.title}>Sentiment trend</Text><Text style={s.note}>{trend.interval === "hour" ? "Hourly" : trend.interval === "day" ? "Daily" : trend.monthsPerBucket > 1 ? `${trend.monthsPerBucket}-month groups` : "Monthly"} · Philippine time</Text></View>
    <Text style={s.note}>Hover over the line for counts · Tap on touch screens</Text>
      <View style={s.chartFrame}>
        <View style={s.chartRow}>
          <View style={s.plot} testID="sentiment-trend-plot" onLayout={event => setPlotWidth(event.nativeEvent.layout.width)}>
            <Animated.View pointerEvents="none" testID="sentiment-line-animation" style={[StyleSheet.absoluteFill, { opacity: reveal,
              transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }]}>
            <Svg width="100%" height={200} viewBox="0 0 800 200" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs><LinearGradient id="sentimentLineFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2F8DE4" stopOpacity={0.18} /><Stop offset="1" stopColor="#2F8DE4" stopOpacity={0.01} /></LinearGradient></Defs>
              <Rect x={0} y={0} width={800} height={66} fill="#FFF6F4" />
              <Rect x={0} y={66} width={800} height={68} fill="#FAFBFE" />
              <Rect x={0} y={134} width={800} height={66} fill="#F2FAF6" />
              {[8, 54, 100, 146, 192].map(y => <Line key={y} x1={0} x2={800} y1={y} y2={y} stroke={y === 100 ? "#BBC9DC" : "#E4EAF3"} strokeDasharray={y === 100 ? "5 5" : undefined} />)}
              {series.map((segment, i) => <React.Fragment key={i}>
                {segment.points.length > 1 && <><Path d={segment.area} fill="url(#sentimentLineFill)" /><Path d={segment.path} fill="none" stroke="#2F8DE4" strokeOpacity={0.1} strokeWidth={8} /><Path d={segment.path} fill="none" stroke="#2F8DE4" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></>}
                {segment.points.map(point => <Circle key={point.index} cx={point.x} cy={point.y} r={selected === point.index ? 5 : 3} fill={selected === point.index ? "#294880" : "#FFFFFF"} stroke="#2F8DE4" strokeWidth={2} />)}
              </React.Fragment>)}
            </Svg>
            </Animated.View>
            <View style={s.columns}>{buckets.map((bucket, index) => {
              const rows = bucketSentiments(bucket);
              const usable = rows.reduce((sum, row) => sum + row.count, 0);
              return <Pressable key={bucket.start} accessibilityRole="button" disabled={bucket.future}
                accessibilityLabel={`${sentimentBucketLabel(bucket, trend.interval, true)}: ${bucket.future ? "upcoming" : usable ? rows.map(row => `${row.title} ${row.count}, ${row.percent.toFixed(1)} percent`).join(", ") : "No usable sentiment results"}. ${bucket.total} total records.`}
                accessibilityState={{ selected: selected === index }} onPress={() => setSelected(index)} onHoverIn={() => setSelected(index)} onHoverOut={() => setSelected(null)}
                onFocus={() => setSelected(index)} onBlur={() => setSelected(null)}
                style={[s.column, selected === index && s.selectedColumn]}>
                {bucket.future ? <View style={s.futureShade} /> : null}
              </Pressable>;
            })}</View>
            {inspected && plotWidth > 0 ? <Animated.View pointerEvents="none" testID="sentiment-trend-tooltip" onLayout={event => setTooltipHeight(event.nativeEvent.layout.height)} style={[s.tooltip, {
              width: tooltipWidth, left: tooltipLeft, top: tooltipTop, opacity: tooltipReveal,
              transform: [{ translateY: tooltipReveal.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }) }],
            }]}>
              <View testID="sentiment-trend-details" accessibilityLiveRegion="polite">
                <Text style={s.detailTitle} numberOfLines={2}>{sentimentBucketLabel(inspected, trend.interval, true)}</Text>
                {[["negative", "Negative", "#C44343"], ["neutral", "Neutral", "#946212"], ["positive", "Positive", "#218052"]].map(([key, label, color]) => <View key={key} style={s.tooltipRow}>
                  <Text style={[s.detailValue, { color }]}>{label}</Text><Text style={s.tooltipCount}>{inspected.counts[key].toLocaleString()}</Text>
                </View>)}
                {!inspectedCount && <Text style={s.note}>No usable sentiment results in this interval.</Text>}
              </View>
            </Animated.View> : null}
          </View>
          <View style={s.axis}>
            <Text style={[s.tick, { top: 0, color: "#C44343" }]}>Negative</Text>
            <Text style={[s.tick, { top: "45%", color: "#946212" }]}>Neutral / balanced</Text>
            <Text style={[s.tick, { bottom: 0, color: "#218052" }]}>Positive</Text>
          </View>
        </View>
        <View style={s.xAxis}>{tickIndices.map(index => <Text key={index} style={[s.xTick,
          index === 0 ? { left: 0 } : index === buckets.length - 1 ? { right: 0, textAlign: "right" } : { left: `${(index + 0.5) / buckets.length * 100}%`, transform: [{ translateX: -26 }] }]}>
          {sentimentBucketLabel(buckets[index], trend.interval)}
        </Text>)}</View>
      </View>
    <Text style={s.note}>Only Negative, Neutral and Positive results are plotted. Positive and negative can balance out. Gaps mean no usable data.</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, borderColor: "#E0E7F1", backgroundColor: "#FBFCFF", padding: 14, gap: 12, minWidth: 0 },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  title: { color: "#203B66", fontFamily: "PoppinsSemiBold", fontSize: 14 }, note: { color: "#64748B", fontFamily: "PoppinsRegular", fontSize: 11, lineHeight: 17 },
  chartFrame: { paddingTop: 10, minWidth: 0 },
  chartRow: { flexDirection: "row", height: 200 }, axis: { width: 82, position: "relative", marginLeft: 6 }, tick: { position: "absolute", left: 0, right: 0, fontFamily: "PoppinsMedium", fontSize: 11 },
  plot: { flex: 1, minWidth: 0, position: "relative", borderRadius: 8, overflow: "hidden" },
  columns: { flex: 1, flexDirection: "row" }, column: { flex: 1, height: "100%" },
  selectedColumn: { backgroundColor: "rgba(41,72,128,0.05)", outlineStyle: "none" }, futureShade: { flex: 1, backgroundColor: "rgba(230,235,243,0.35)" },
  xAxis: { position: "relative", marginRight: 88, height: 35, marginTop: 8 }, xTick: { position: "absolute", width: 52, fontSize: 9, color: "#64748B", textAlign: "center" },
  tooltip: { position: "absolute", zIndex: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E2F0", borderRadius: 10, padding: 10,
    shadowColor: "#17365F", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 5 },
  detailTitle: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#294880", marginBottom: 6 },
  tooltipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, paddingVertical: 2 },
  detailValue: { fontFamily: "PoppinsMedium", fontSize: 11 }, tooltipCount: { fontFamily: "PoppinsSemiBold", fontSize: 11, color: "#203B66" },
});
