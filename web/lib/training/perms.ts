// Special permissions for training (Admin > Access > Special permissions). With nobody on a list, any full administrator may.
export const TRAINING_PERMS = {
  "training.publish": "Publish a training test revision",
  "training.rollout": "Force a re-pass of a test (sets a deadline that can lapse authorizations)",
  "training.override": "Manually advance, waive, or revoke someone's training certification",
  "training.discord": "Change the training Discord announcements",
} as const;
export type TrainingPerm = keyof typeof TRAINING_PERMS;
