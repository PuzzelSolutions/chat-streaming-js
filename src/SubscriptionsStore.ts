/**
 * In-memory store for active {@link StreamSubscription} instances.
 *
 * Subscriptions are identified by their {@link StreamSubscription.getSubscriptionId}
 * value. Adding a subscription with a duplicate ID replaces the previous one.
 * @module
 */
import type StreamSubscription from './StreamSubscription';

let subscriptions: StreamSubscription[] = [];

/** Look up a subscription by its string ID. Returns `null` if not found. */
export const findById = (subscriptionId: string | null | undefined): StreamSubscription | null => {
  return (
    (subscriptionId && subscriptions.find((s) => s.getSubscriptionId() === subscriptionId)) || null
  );
};

/** Check whether a matching subscription is currently stored. */
export const exists = (subscription: StreamSubscription): boolean => {
  return !!get(subscription);
};

/** Add a subscription, replacing any existing one with the same ID. */
export const add = (subscription: StreamSubscription): void => {
  remove(get(subscription));
  subscriptions.push(subscription);
};

/** Retrieve the stored instance that matches the given subscription's ID. */
export const get = (
  subscription: StreamSubscription | null | undefined,
): StreamSubscription | null => {
  return (
    (subscription &&
      subscriptions.find((s) => s.getSubscriptionId() === subscription.getSubscriptionId())) ||
    null
  );
};

/** Return all stored subscriptions. */
export const getAll = (): StreamSubscription[] => {
  return subscriptions;
};

/** Remove a subscription by reference. Returns `true` if an entry was removed. */
export const remove = (subscription: StreamSubscription | null | undefined): boolean => {
  if (subscription && typeof subscription === 'object') {
    subscriptions = subscriptions.filter(
      (s) => s.getSubscriptionId() !== subscription.getSubscriptionId(),
    );
    return true;
  }
  return false;
};

/** Remove all subscriptions from the store. */
export const removeAll = (): void => {
  subscriptions = [];
};
