/**
 * In-memory store for active {@link StreamSubscription} instances.
 *
 * Subscriptions are identified by their {@link StreamSubscription.getSubscriptionId}
 * value. Adding a subscription with a duplicate ID replaces the previous one.
 * @module
 */
import type StreamSubscription from './StreamSubscription';

export interface SubscriptionsStoreInstance {
  findById: (subscriptionId: string | null | undefined) => StreamSubscription | null;
  exists: (subscription: StreamSubscription) => boolean;
  add: (subscription: StreamSubscription) => void;
  get: (subscription: StreamSubscription | null | undefined) => StreamSubscription | null;
  getAll: () => StreamSubscription[];
  remove: (subscription: StreamSubscription | null | undefined) => boolean;
  removeAll: () => void;
}

/**
 * Create an isolated subscriptions store instance.
 *
 * Each call returns an independent store with its own internal state.
 * Use this factory when creating a {@link StreamConnectorHandle} instance
 * so that multiple connectors never share subscription state.
 */
export function createSubscriptionsStore(): SubscriptionsStoreInstance {
  let subscriptions: StreamSubscription[] = [];

  const findById = (subscriptionId: string | null | undefined): StreamSubscription | null =>
    (subscriptionId && subscriptions.find((s) => s.getSubscriptionId() === subscriptionId)) || null;

  const exists = (subscription: StreamSubscription): boolean => !!getItem(subscription);

  const add = (subscription: StreamSubscription): void => {
    remove(getItem(subscription));
    subscriptions.push(subscription);
  };

  const getItem = (
    subscription: StreamSubscription | null | undefined,
  ): StreamSubscription | null =>
    (subscription &&
      subscriptions.find((s) => s.getSubscriptionId() === subscription.getSubscriptionId())) ||
    null;

  const getAll = (): StreamSubscription[] => subscriptions;

  const remove = (subscription: StreamSubscription | null | undefined): boolean => {
    if (subscription && typeof subscription === 'object') {
      subscriptions = subscriptions.filter(
        (s) => s.getSubscriptionId() !== subscription.getSubscriptionId(),
      );
      return true;
    }
    return false;
  };

  const removeAll = (): void => {
    subscriptions = [];
  };

  return { findById, exists, add, get: getItem, getAll, remove, removeAll };
}

// Module-level singleton — kept for direct imports in tests and legacy usage.
const _defaultStore = createSubscriptionsStore();

/** Look up a subscription by its string ID. Returns `null` if not found. */
export const findById = _defaultStore.findById;
/** Check whether a matching subscription is currently stored. */
export const exists = _defaultStore.exists;
/** Add a subscription, replacing any existing one with the same ID. */
export const add = _defaultStore.add;
/** Retrieve the stored instance that matches the given subscription's ID. */
export const get = _defaultStore.get;
/** Return all stored subscriptions. */
export const getAll = _defaultStore.getAll;
/** Remove a subscription by reference. Returns `true` if an entry was removed. */
export const remove = _defaultStore.remove;
/** Remove all subscriptions from the store. */
export const removeAll = _defaultStore.removeAll;
