export type PublicAuthData = {
  profile: { id: string; nickname: string; emoji: string; mustChangePin: boolean };
  group: { id: string; name: string; maxMembers: 15; memberCount: number };
};
