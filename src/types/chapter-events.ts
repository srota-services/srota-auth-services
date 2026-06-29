export interface ChapterGatingChangedMessage {
   chapterId: string;
   audiobookId: string;
   action: 'created' | 'updated' | 'deleted';
}
