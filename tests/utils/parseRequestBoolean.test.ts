import { parseRequestBoolean } from '../../src/utils/parseRequestBoolean';

describe('parseRequestBoolean', () => {
   it('returns undefined for absent values', () => {
      expect(parseRequestBoolean(undefined)).toBeUndefined();
      expect(parseRequestBoolean(null)).toBeUndefined();
   });

   it('coerces string and boolean true', () => {
      expect(parseRequestBoolean('true')).toBe(true);
      expect(parseRequestBoolean(true)).toBe(true);
   });

   it('coerces string and boolean false', () => {
      expect(parseRequestBoolean('false')).toBe(false);
      expect(parseRequestBoolean(false)).toBe(false);
   });

   it('returns undefined for invalid values', () => {
      expect(parseRequestBoolean('yes')).toBeUndefined();
      expect(parseRequestBoolean(1)).toBeUndefined();
   });
});
