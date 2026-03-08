import type { MetaAdsClient } from "../client.ts";
import { resolve, dirname } from "path";

export async function createAd(
  client: MetaAdsClient,
  adSetId: string,
  config: Record<string, unknown>,
  workspaceRoot?: string,
): Promise<string> {
  const creative = config.creative as Record<string, unknown>;
  const adType = config.type as string;

  // Build creative spec
  const creativeSpec: Record<string, unknown> = {
    name: `${config.name} Creative`,
  };

  if (adType === "image" || adType === "carousel") {
    const objectStorySpec: Record<string, unknown> = {};

    if (adType === "image" && creative.image) {
      // Upload image if it's a local path
      const imagePath = creative.image as string;
      let imageHash: string | undefined;

      if (imagePath.startsWith("./") || imagePath.startsWith("/")) {
        const fullPath = imagePath.startsWith("/")
          ? imagePath
          : resolve(workspaceRoot ?? process.cwd(), imagePath);
        imageHash = await client.uploadImage(fullPath);
      }

      objectStorySpec.link_data = {
        message: creative.body ?? "",
        link: creative.link ?? "",
        name: creative.headline ?? "",
        call_to_action: creative.call_to_action
          ? { type: creative.call_to_action }
          : undefined,
        ...(imageHash ? { image_hash: imageHash } : {}),
      };
    }

    if (adType === "carousel" && creative.cards) {
      const cards = creative.cards as Array<Record<string, unknown>>;
      const childAttachments = [];

      for (const card of cards) {
        let imageHash: string | undefined;
        const imagePath = card.image as string;

        if (imagePath && (imagePath.startsWith("./") || imagePath.startsWith("/"))) {
          const fullPath = imagePath.startsWith("/")
            ? imagePath
            : resolve(workspaceRoot ?? process.cwd(), imagePath);
          imageHash = await client.uploadImage(fullPath);
        }

        childAttachments.push({
          name: card.headline ?? "",
          link: card.link ?? "",
          ...(card.description ? { description: card.description } : {}),
          ...(imageHash ? { image_hash: imageHash } : {}),
        });
      }

      objectStorySpec.link_data = {
        message: creative.body ?? "",
        link: (cards[0] as Record<string, unknown>)?.link ?? "",
        child_attachments: childAttachments,
        call_to_action: creative.call_to_action
          ? { type: creative.call_to_action }
          : undefined,
      };
    }

    creativeSpec.object_story_spec = objectStorySpec;
  }

  const params: Record<string, unknown> = {
    name: config.name,
    adset_id: adSetId,
    creative: creativeSpec,
    status: "PAUSED",
  };

  return client.createAd(params);
}

export async function updateAd(
  client: MetaAdsClient,
  adId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const params: Record<string, unknown> = {};

  if (changes.name !== undefined) params.name = changes.name;
  if (changes.status !== undefined) params.status = changes.status;

  await client.updateAd(adId, params);
}
