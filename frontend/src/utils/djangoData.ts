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
