import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Upload a user avatar to Supabase Storage and return its public URL.
 * File is stored at `avatars/{userId}/avatar.{ext}`.
 * Overwrites any existing avatar for the user.
 */
export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 업로드할 수 있습니다.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('이미지 크기는 5MB 이하여야 합니다.')
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${userId}/avatar.${ext}`

  // Upsert to overwrite any existing avatar
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })

  if (uploadError) {
    throw new Error(`업로드 실패: ${uploadError.message}`)
  }

  // Append a cache-buster so the UI picks up the new image immediately
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
