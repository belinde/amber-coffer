import type { Icon } from '@phosphor-icons/react';
import {
  ArrowLeft,
  Article,
  Backpack,
  BookOpen,
  CalendarBlank,
  CaretRight,
  ChartBar,
  Compass,
  Eye,
  Flag,
  FloppyDisk,
  Globe,
  IdentificationCard,
  Images,
  Lightbulb,
  Link,
  ListBullets,
  Lock,
  Notebook,
  Palette,
  PencilSimple,
  Plus,
  Record,
  Stop,
  Target,
  Tag,
  Trash,
  User,
  X,
  MaskHappy,
  MapTrifold,
  GearSix,
} from '@phosphor-icons/react';

import type { SectionId } from '../../features/vault/entity-sections.config.js';
import type { VaultCategory } from '../../features/vault/vault-categories.js';

export const ActionIcons = {
  back: ArrowLeft,
  open: CaretRight,
  save: FloppyDisk,
  delete: Trash,
  add: Plus,
  cancel: X,
  edit: PencilSimple,
  dismiss: X,
  create: Plus,
  record: Record,
  stop: Stop,
} as const;

export function iconForVaultCategory(category: VaultCategory): Icon {
  switch (category) {
    case 'characters':
      return User;
    case 'npcs':
      return MaskHappy;
    case 'locations':
      return MapTrifold;
    case 'factions':
      return Flag;
    case 'lore_notes':
      return Globe;
    case 'narrative_seeds':
      return Lightbulb;
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

export function iconForSection(sectionId: SectionId): Icon {
  switch (sectionId) {
    case 'identity':
      return IdentificationCard;
    case 'operational':
      return Compass;
    case 'appearance':
      return Eye;
    case 'visual':
      return Palette;
    case 'linkedImages':
      return Images;
    case 'equipment':
      return Backpack;
    case 'gameStats':
      return ChartBar;
    case 'characterLinks':
      return Link;
    case 'events':
      return CalendarBlank;
    case 'gmNotes':
      return Notebook;
    case 'visibility':
      return Lock;
    case 'sections':
      return ListBullets;
    case 'goals':
      return Target;
    case 'metadata':
      return Tag;
    case 'body':
      return Article;
    case 'links':
      return Link;
    case 'idea':
      return Lightbulb;
    default: {
      const exhaustive: never = sectionId;
      return exhaustive;
    }
  }
}

export {
  GearSix as SettingsIcon,
  Link as ConnectionsIcon,
  CalendarBlank as SessionsIcon,
  Images as ImagesIcon,
  BookOpen as CampaignVaultIcon,
};
