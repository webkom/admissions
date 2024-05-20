export type DjangoUserData = {
  profile_picture?: string;
  full_name?: string;
  representative_of_group?: string;
  is_staff?: boolean;
  is_member_of_webkom?: boolean;
};

export type DjangoData = {
  user: DjangoUserData;
};

const defaultConfig: DjangoData = { user: {} };
const config = window.__DJANGO__
  ? { ...defaultConfig, ...window.__DJANGO__ }
  : defaultConfig;

export default config;

export const isLoggedIn: () => boolean = () => !!config.user.full_name;

export const isManager: () => boolean = () =>
  !!config.user.is_staff || !!config.user.is_member_of_webkom;
