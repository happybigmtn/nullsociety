import { useEffect, useState } from 'react';
import { getActivityItems, subscribeActivity, type ActivityItem, type ActivitySurface } from '../services/txTracker';

export function useActivityFeed(surface: ActivitySurface, limit = 12): ActivityItem[] {
  const [items, setItems] = useState<ActivityItem[]>(() => getActivityItems(surface).slice(0, limit));

  useEffect(() => {
    return subscribeActivity(() => {
      setItems(getActivityItems(surface).slice(0, limit));
    });
  }, [limit, surface]);

  return items;
}

