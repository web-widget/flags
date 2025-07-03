/**
 * Creates a transform stream that conditionally injects flag values script before </body> tag in HTML content
 */
export function createFlagScriptInjectionTransform(
  scriptContent: () => Promise<string>,
): TransformStream {
  // State machine for tracking </body> tag matching
  let state: 'normal' | 'partial_match' = 'normal';
  let matchBuffer = '';
  const bodyEndTag = '</body>';
  let injected = false;

  return new TransformStream({
    async transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      let outputBuffer = '';
      let i = 0;

      while (i < text.length) {
        const char = text[i];

        if (state === 'normal') {
          if (char === '<') {
            // Start potential match
            state = 'partial_match';
            matchBuffer = char;
          } else {
            // Normal character, output immediately
            outputBuffer += char;
          }
        } else if (state === 'partial_match') {
          matchBuffer += char;

          // Check if we still have a potential match
          if (bodyEndTag.startsWith(matchBuffer)) {
            // Still matching, continue
            if (matchBuffer === bodyEndTag) {
              // Complete match found!
              if (!injected) {
                const content = await scriptContent();
                if (content) {
                  const scriptTag = `<script type="application/json" data-flag-values>${content}</script>`;
                  outputBuffer += scriptTag;
                  injected = true;
                }
              }
              outputBuffer += bodyEndTag;
              state = 'normal';
              matchBuffer = '';
            }
          } else {
            // No longer matching, output the buffer except the last char
            const bufferToOutput = matchBuffer.slice(0, -1);
            outputBuffer += bufferToOutput;
            state = 'normal';
            matchBuffer = '';
            // Reprocess current character (last char from matchBuffer) in normal state
            if (char === '<') {
              state = 'partial_match';
              matchBuffer = char;
            } else {
              outputBuffer += char;
            }
          }
        }

        i++;
      }

      // Output any accumulated content
      if (outputBuffer) {
        controller.enqueue(new TextEncoder().encode(outputBuffer));
      }
    },

    async flush(controller) {
      // If we have a partial match at the end, output it
      if (matchBuffer) {
        controller.enqueue(new TextEncoder().encode(matchBuffer));
      }
    },
  });
}
