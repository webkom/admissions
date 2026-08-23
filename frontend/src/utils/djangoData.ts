export type DjangoUserData = {
  id?: string;
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
const serialized = document.getElementById("django-data")?.textContent;
let embedded: DjangoData | undefined;
try {
  embedded = serialized ? (JSON.parse(serialized) as DjangoData) : undefined;
} catch {
  embedded = undefined;
}
const config = { ...defaultConfig, ...(embedded ?? window.__DJANGO__) };

export default config;

export const isLoggedIn: () => boolean = () => !!config.user.full_name;

export const isManager: () => boolean = () =>
  !!config.user.is_staff || !!config.user.is_member_of_webkom;
