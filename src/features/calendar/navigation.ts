export type NavigationGuard = {
  close(next?: () => void): void | Promise<void>;
  protected(): boolean;
};
export type AddRecordHandle = { addToday(): void };
