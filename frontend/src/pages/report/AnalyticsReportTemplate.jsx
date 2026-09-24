import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { ANALYTICS_CONFIG } from './reportConfig';
import { DynamicSectionPage } from './DynamicSectionPage';

// ── Theme helper (dark/light palette) ─────────────────────────────────────────
function getThemeStyles(theme = 'dark') {
  const isLight = theme === 'light';
  const pageBg = isLight ? '#f8fafc' : '#0f172a';
  const cardBg = isLight ? '#ffffff' : '#1e293b';
  const borderColor = isLight ? '#e2e8f0' : '#334155';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subColor = isLight ? '#334155' : '#e2e8f0';
  const mutedColor = isLight ? '#64748b' : '#94a3b8';

  return StyleSheet.create({
    coverPage: { fontSize: 9, color: textColor, backgroundColor: pageBg, padding: 40 },
    brandBar: { height: 6, backgroundColor: '#818cf8', borderRadius: 3, marginBottom: 32 },
    title: { fontSize: 18, fontWeight: 800, color: textColor, textAlign: 'center' },
    badgeContainer: { alignItems: 'center', marginBottom: 36, marginTop: 10 },
    dateBadge: {
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: borderColor,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
    },
    tocCard: { backgroundColor: cardBg, borderWidth: 1, borderColor: borderColor, borderRadius: 10, padding: 20, flex: 1 },
    tocHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    tocHeaderBar: { width: 4, height: 18, backgroundColor: '#818cf8', borderRadius: 2, marginRight: 10 },
    tocHeaderTitle: { fontSize: 12, fontWeight: 800, color: textColor, letterSpacing: 2, textTransform: 'uppercase' },
    tocRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: borderColor },
    tocNumberBox: { width: 28, height: 22, borderRadius: 5, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    tocNumberText: { fontSize: 8.5, fontWeight: 800, color: '#ffffff' },
    tocTitle: { fontSize: 10, fontWeight: 700, color: subColor },
    tocSubtitle: { fontSize: 7.5, color: mutedColor, marginTop: 1 },
    coverFooter: { marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    confidentialBadge: { backgroundColor: '#dc2626', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8, marginRight: 10 },
  });
}

// ── Main Document Component ───────────────────────────────────────────────────
export default function AnalyticsReportTemplate({ data }) {
  if (!data) return null;

  const S = getThemeStyles(data.theme || 'dark');
  const dateStr = new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const selectedSection = data.section || 'all';

  // Flatten the config: if an integration has subTabs, use them; otherwise use the top-level section
  const allSections = [];
  ANALYTICS_CONFIG.forEach((integration) => {
    if (integration.subTabs && integration.subTabs.length > 0) {
      integration.subTabs.forEach((subTab) => {
        allSections.push({
          ...subTab,
          integrationId: integration.id,
          integrationAlias: integration.alias,
          integrationTitle: integration.title,
        });
      });
    } else {
      allSections.push({
        ...integration,
        integrationId: integration.id,
        integrationAlias: integration.alias,
      });
    }
  });

  // Filter sections that have active data
  const activeSections = allSections.filter((sec) => {
    // Check if section matches the requested section scope
    if (selectedSection !== 'all') {
      const match =
        sec.id === selectedSection ||
        sec.sectionKey === selectedSection ||
        sec.integrationId === selectedSection ||
        sec.integrationAlias === selectedSection;
      if (!match) return false;
    }
    // Check if section actually has data to display
    return sec.hasData ? sec.hasData(data) : true;
  });

  return (
    <Document title={`CISO Analytics Report - ${data.orgName}`} author="CISO Dashboard" creator="CISO Dashboard">
      {/* 1. Main Cover Page with dynamic Table of Contents */}
      <Page size="A3" orientation="landscape" style={S.coverPage}>
        <View style={S.brandBar} />
        <View style={{ alignItems: 'center' }}>
          <Text style={S.title}>{data.orgName || 'Organisation'}</Text>
        </View>
        <View style={S.badgeContainer}>
          <View style={S.dateBadge}>
            <Text style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', letterSpacing: 0.5 }}>{dateStr}</Text>
            {data.isFiltered && data.periodLabel && (
              <Text style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', marginLeft: 10 }}>
                · Date Filter: {data.periodLabel}
              </Text>
            )}
          </View>
        </View>

        <View style={S.tocCard}>
          <View style={S.tocHeader}>
            <View style={S.tocHeaderBar} />
            <Text style={S.tocHeaderTitle}>Analytics Report Contents</Text>
          </View>
          {activeSections.map((sec, idx) => (
            <View key={sec.id} style={[S.tocRow, { borderTopWidth: idx === 0 ? 0 : 1 }]}>
              <View style={[S.tocNumberBox, { backgroundColor: sec.color || '#818cf8' }]}>
                <Text style={S.tocNumberText}>{sec.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.tocTitle}>{sec.title}</Text>
                {sec.subtitle && <Text style={S.tocSubtitle}>{sec.subtitle}</Text>}
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: 'rgba(129, 140, 248, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: '#818cf8', fontWeight: 700 }}>{'>'}</Text>
              </View>
            </View>
          ))}
          {activeSections.length === 0 && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: '#94a3b8' }}>No telemetry data found for the selected scope/filter.</Text>
            </View>
          )}
        </View>

        <View style={S.coverFooter}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={S.confidentialBadge}>
              <Text style={{ fontSize: 7.5, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>CONFIDENTIAL</Text>
            </View>
            <Text style={{ fontSize: 8, color: '#64748b' }}>CISO Analytics Report</Text>
          </View>
          <Text style={{ fontSize: 8, color: '#64748b' }}>{data.orgName}</Text>
        </View>
      </Page>

      {/* 2. Dynamically rendered active sections */}
      {activeSections.map((secConfig) => (
        <DynamicSectionPage key={secConfig.id} config={secConfig} data={data} />
      ))}
    </Document>
  );
}
