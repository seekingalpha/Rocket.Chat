import { settingsRegistry } from '../../app/settings/server';

export const createSeekingAlphaSettings = () =>
	settingsRegistry.addGroup('Seeking_Alpha', async function () {
		await this.add('Seeking_Alpha__Report_on_Terms_of_Use_Violations', false, {
			type: 'boolean',
		});
	});
