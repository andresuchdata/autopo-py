// types/google-drive.d.ts
declare module 'googleapis' {
  import { drive_v3 } from 'googleapis';
  export const google: {
    drive: (options: { version: 'v3'; auth: any }) => drive_v3.Drive;
  };
  export type { drive_v3 };
}