/**
 * permissions.js
 * Helper utilities for Quattro owner permission checks.
 */

/**
 * Returns true if userId is in the owners array.
 * @param {string} userId
 * @param {string[]} owners
 * @returns {boolean}
 */
function isQuattroOwner(userId, owners) {
  return owners.includes(userId);
}

/**
 * Asserts that the interaction user is a Quattro owner.
 * Sends an ephemeral error reply if not.
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>} true if owner, false otherwise
 */
async function assertOwner(interaction, client) {
  const owners = client.appEnv?.quattroOwners ?? [];
  if (isQuattroOwner(interaction.user.id, owners)) {
    return true;
  }

  const content = "🚫 You don't have permission to use this command.";
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content, flags: 64 });
    } else {
      await interaction.followUp({ content, flags: 64 });
    }
  } catch (err) {
    console.error("[Master] assertOwner: failed to send permission denial:", err.message);
  }

  return false;
}

module.exports = { isQuattroOwner, assertOwner };
