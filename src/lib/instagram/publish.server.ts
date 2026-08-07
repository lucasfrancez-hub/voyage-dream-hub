import { publishStoryImage, publishFeedImage, publishFeedCarousel, publishReelsVideo, publishStoryVideo } from "./api.server";

async function loadAccount(accountId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("instagram_accounts")
    .select("ig_user_id, access_token")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data?.access_token) throw new Error(`conta IG ${accountId} sem token`);
  return data as { ig_user_id: string; access_token: string };
}

export async function publishInstagramMedia(params: {
  accountId: string;
  mediaType: "story_image" | "feed_image" | "carousel" | "reels_video" | "story_video";
  imageUrls: string[];
  videoUrl?: string;
  coverUrl?: string;
  caption?: string;
  packageId?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}) {
  const acc = await loadAccount(params.accountId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("instagram_media")
    .insert({
      account_id: params.accountId,
      package_id: params.packageId ?? null,
      media_type: params.mediaType,
      caption: params.caption ?? null,
      image_urls: params.imageUrls,
      status: "publishing",
      created_by: params.createdBy ?? null,
      created_by_name: params.createdByName ?? null,
    })
    .select()
    .single();

  try {
    let result;
    if (params.mediaType === "reels_video") {
      if (!params.videoUrl) throw new Error("Vídeo obrigatório para Reels");
      result = await publishReelsVideo({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        videoUrl: params.videoUrl,
        caption: params.caption,
        coverUrl: params.coverUrl,
      });
    } else if (params.mediaType === "story_video") {
      if (!params.videoUrl) throw new Error("Vídeo obrigatório para Story");
      result = await publishStoryVideo({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        videoUrl: params.videoUrl,
      });
    } else if (params.mediaType === "story_image") {
      result = await publishStoryImage({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        imageUrl: params.imageUrls[0],
      });
    } else if (params.mediaType === "feed_image") {
      result = await publishFeedImage({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        imageUrl: params.imageUrls[0],
        caption: params.caption,
      });
    } else {
      result = await publishFeedCarousel({
        igUserId: acc.ig_user_id,
        token: acc.access_token,
        imageUrls: params.imageUrls,
        caption: params.caption,
      });
    }

    await supabaseAdmin
      .from("instagram_media")
      .update({
        status: "published",
        ig_media_id: result.id,
        container_id: result.container_id ?? null,
        permalink: result.permalink ?? null,
        published_at: new Date().toISOString(),
      })
      .eq("id", row!.id);

    return { row_id: row!.id, ...result };
  } catch (e) {
    const msg = (e as Error).message;
    await supabaseAdmin
      .from("instagram_media")
      .update({ status: "failed", error: msg })
      .eq("id", row!.id);
    throw e;
  }
}
