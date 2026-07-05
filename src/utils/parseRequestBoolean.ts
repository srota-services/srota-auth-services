/**
 * Coerce multipart/form or JSON body values to boolean.
 * Form fields arrive as strings ("true" / "false").
 */
export function parseRequestBoolean(value: unknown): boolean | undefined {
   if (value === undefined || value === null) {
      return undefined;
   }
   if (value === true || value === 'true') {
      return true;
   }
   if (value === false || value === 'false') {
      return false;
   }
   return undefined;
}
