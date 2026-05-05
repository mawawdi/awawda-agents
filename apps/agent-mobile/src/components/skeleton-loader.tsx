import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

interface SkeletonBarProps {
  height?: number
  width?: number | `${number}%`
  borderRadius?: number
  style?: object
}

function SkeletonBar({ height = 16, width = '100%', borderRadius = 6, style }: SkeletonBarProps): React.JSX.Element {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [shimmer])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] })

  return (
    <Animated.View
      style={[{ height, width, borderRadius, backgroundColor: '#d0d0d0', opacity }, style]}
    />
  )
}

export function CustomerListSkeleton(): React.JSX.Element {
  return (
    <View style={styles.container}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.cardRow}>
          <SkeletonBar height={14} width="55%" />
          <SkeletonBar height={12} width="30%" style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  )
}

export function OrderListSkeleton(): React.JSX.Element {
  return (
    <View style={styles.container}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.orderCard}>
          <View style={styles.orderCardHeader}>
            <SkeletonBar height={14} width="45%" />
            <SkeletonBar height={13} width="30%" />
          </View>
          <SkeletonBar height={11} width="40%" style={{ marginTop: 6 }} />
          <View style={styles.orderThumbRow}>
            {Array.from({ length: 3 }).map((_, j) => (
              <SkeletonBar key={j} height={60} width={60} borderRadius={8} style={{ marginRight: 6 }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

export function CatalogGridSkeleton({ columns = 3 }: { columns?: number }): React.JSX.Element {
  return (
    <View style={[styles.container, styles.grid]}>
      {Array.from({ length: columns * 3 }).map((_, i) => (
        <View key={i} style={[styles.catalogCell, { width: `${Math.floor(100 / columns) - 2}%` }]}>
          <SkeletonBar height={90} width="100%" borderRadius={8} />
          <SkeletonBar height={11} width="70%" style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10 },
  cardRow: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  orderCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  orderThumbRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  catalogCell: {
    margin: '1%',
    alignItems: 'center',
  },
})
