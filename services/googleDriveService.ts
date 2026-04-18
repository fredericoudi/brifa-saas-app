const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DEFAULT_DRIVE_TIMEZONE = "America/Sao_Paulo";

type GoogleTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type DriveFolder = {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
};

async function parseGoogleError(response: Response) {
  const fallback = `Google API request failed with status ${response.status}.`;

  try {
    const data = (await response.json()) as {
      error?: { message?: string };
      error_description?: string;
    };

    return data.error?.message || data.error_description || fallback;
  } catch {
    return fallback;
  }
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeDriveFolderName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDriveTimeZone(value?: string | null) {
  if (!value) {
    return DEFAULT_DRIVE_TIMEZONE;
  }

  try {
    Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_DRIVE_TIMEZONE;
  }
}

function resolveDriveYearFolderName(timeZone?: string | null) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveDriveTimeZone(timeZone),
    year: "numeric"
  });

  return formatter.format(new Date());
}

async function findDriveFolderByName({
  accessToken,
  name,
  parentFolderId
}: {
  accessToken: string;
  name: string;
  parentFolderId: string;
}) {
  const query = [
    `mimeType='${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
    `name='${escapeDriveQueryValue(name)}'`,
    `'${escapeDriveQueryValue(parentFolderId)}' in parents`,
    "trashed=false"
  ].join(" and ");

  const response = await fetch(
    `${GOOGLE_DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,mimeType)&pageSize=1`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(await parseGoogleError(response));
  }

  const payload = (await response.json()) as { files?: DriveFolder[] };
  return payload.files?.[0] ?? null;
}

async function getOrCreateDriveFolder({
  accessToken,
  name,
  parentFolderId
}: {
  accessToken: string;
  name: string;
  parentFolderId: string;
}) {
  const sanitizedFolderName = sanitizeDriveFolderName(name);
  const existingFolder = await findDriveFolderByName({
    accessToken,
    name: sanitizedFolderName,
    parentFolderId
  });

  if (existingFolder) {
    return existingFolder;
  }

  return createDriveFolder({
    accessToken,
    name: sanitizedFolderName,
    parentFolderId
  });
}

async function createDriveFolder({
  accessToken,
  name,
  parentFolderId
}: {
  accessToken: string;
  name: string;
  parentFolderId?: string;
}) {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_ENDPOINT}?fields=id,name,webViewLink,mimeType`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      parents: parentFolderId ? [parentFolderId] : undefined
    })
  });

  if (!response.ok) {
    throw new Error(await parseGoogleError(response));
  }

  return (await response.json()) as DriveFolder;
}

export function getFolderLink(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export async function createJobFolder({
  accessToken,
  rootFolderId,
  clientName,
  clientPrefix,
  jobCode,
  jobTitle,
  agencyTimeZone
}: {
  accessToken: string;
  rootFolderId: string;
  clientName: string;
  clientPrefix: string;
  jobCode: string;
  jobTitle: string;
  agencyTimeZone?: string | null;
}) {
  const yearFolder = await getOrCreateDriveFolder({
    accessToken,
    name: resolveDriveYearFolderName(agencyTimeZone),
    parentFolderId: rootFolderId
  });

  const clientFolder = await getOrCreateDriveFolder({
    accessToken,
    name: `${clientPrefix}-${clientName}`,
    parentFolderId: yearFolder.id
  });

  const mainFolder = await getOrCreateDriveFolder({
    accessToken,
    name: `${jobCode} - ${jobTitle}`,
    parentFolderId: clientFolder.id
  });

  return {
    folderId: mainFolder.id,
    folderUrl: getFolderLink(mainFolder.id)
  };
}

export async function exchangeGoogleAuthorizationCode({
  code,
  redirectUri
}: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(await parseGoogleError(response));
  }

  const token = (await response.json()) as GoogleTokenPayload;

  if (!token.access_token) {
    throw new Error("Google OAuth response does not include access_token.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null
  };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(await parseGoogleError(response));
  }

  const token = (await response.json()) as GoogleTokenPayload;

  if (!token.access_token) {
    throw new Error("Google OAuth refresh response does not include access_token.");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null
  };
}

export async function getFolderMetadata({
  accessToken,
  folderId
}: {
  accessToken: string;
  folderId: string;
}) {
  const response = await fetch(
    `${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(folderId)}?fields=id,name,mimeType,webViewLink`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(await parseGoogleError(response));
  }

  const folder = (await response.json()) as DriveFolder;

  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new Error("O ID informado não corresponde a uma pasta do Google Drive.");
  }

  return folder;
}
