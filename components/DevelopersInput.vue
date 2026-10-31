<template>
  <UiTagInput
    v-model="developers"
    :suggestions="developerListFiltered"
    :allow-new="false"
    :tag-style="tagChipStyle"
    icon="label"
    field="this"
    placeholder="developer username"
    open-on-focus
    @focus="ensureLoaded"
    @typing="onTyping">
    <template #default="{ option }">
      <span v-for="(part, index) in String(option).split('@')" :key="index">
        <span v-if="index === 0">{{ part }}</span>
        <strong v-else style="color: var(--accent)">(@{{ part }})</strong>
      </span>
    </template>
  </UiTagInput>
</template>

<script setup lang="ts">
import repositories from "../public/data/repositories.json";
import { tagChipStyle } from "~/utils/palette";

let usernamesPromise: Promise<string[]> | null = null;
let emailsPromise: Promise<string[]> | null = null;

const fetchAcrossRepositories = (filename: string): Promise<string[]> =>
  Promise.all(
    repositories.map(async (repo) => {
      try {
        const res = await fetch(`/data/${repo.dirname}/${filename}`);
        return res.ok ? ((await res.json()) as string[]) : [];
      } catch {
        return [];
      }
    }),
  ).then((lists) => Array.from(new Set(lists.flat())));

const getUsernames = () =>
  (usernamesPromise ??= fetchAcrossRepositories("usernames.json"));
const getEmails = () =>
  (emailsPromise ??= fetchAcrossRepositories("emails.json"));

const developers = defineModel<string[]>({ default: () => [] });

const props = defineProps({
  size: {
    type: String,
    default: undefined,
  },
  allowUsername: {
    type: Boolean,
    default: true,
  },
  allowEmail: {
    type: Boolean,
    default: false,
  },
});

const developerList = shallowRef<string[]>([]);
const developerListFiltered = shallowRef<string[]>([]);
const currentQuery = ref("");

let loadedKey = "";
let activeLoad: Promise<void> | null = null;

const updateSuggestions = (rawQuery: string) => {
  const q = (rawQuery ?? "").trim().toLowerCase();
  if (q.length <= 2) {
    developerListFiltered.value = [];
    return;
  }

  const prefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const candidate of developerList.value) {
    const idx = candidate.toLowerCase().indexOf(q);
    if (idx === 0) {
      prefixMatches.push(candidate);
    } else if (idx > 0) {
      substringMatches.push(candidate);
    }
  }

  prefixMatches.sort((a, b) => a.length - b.length || a.localeCompare(b));
  substringMatches.sort((a, b) => {
    const diff = a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  developerListFiltered.value = [...prefixMatches, ...substringMatches].slice(0, 10);
};

const ensureLoaded = (): Promise<void> => {
  const targetKey = `${props.allowUsername ? 1 : 0}:${props.allowEmail ? 1 : 0}`;
  if (loadedKey === targetKey) {
    return Promise.resolve();
  }
  if (activeLoad) {
    return activeLoad;
  }

  activeLoad = (async () => {
    try {
      const [usernames, emails] = await Promise.all([
        props.allowUsername ? getUsernames() : Promise.resolve([]),
        props.allowEmail ? getEmails() : Promise.resolve([]),
      ]);
      developerList.value = Array.from(new Set([...usernames, ...emails]));
      loadedKey = targetKey;
      if (currentQuery.value) {
        updateSuggestions(currentQuery.value);
      }
    } finally {
      activeLoad = null;
    }
  })();

  return activeLoad;
};

const onTyping = (text: string) => {
  currentQuery.value = text ?? "";
  if (currentQuery.value.length > 0 && loadedKey === "") {
    ensureLoaded();
  }
  updateSuggestions(currentQuery.value);
};

watch(
  () => [props.allowUsername, props.allowEmail],
  () => {
    if (loadedKey !== "") {
      loadedKey = "";
      ensureLoaded();
    }
  },
);
</script>
