import * as path from 'canonical-path';
import * as ts from 'typescript';
import { Project, MethodSignature, PropertySignature, Type, SourceFile } from 'ts-morph';

function getInterfaceName(value: string, type = 'Properties') {
	const result = value.replace(/-([a-z])/g, function(g) {
		return g[1].toUpperCase();
	});
	return `${result.charAt(0).toUpperCase() + result.slice(1)}${type}`;
}

export interface PropertyInterface {
	name: string;
	type: string;
	optional: boolean;
	description?: string;
}

function format(prop: MethodSignature | PropertySignature): PropertyInterface {
	return {
		name: prop.getName(),
		type: prop.getType().getText(prop),
		optional: prop.hasQuestionToken() || false,
		description: prop.getJsDocs()[0] && prop.getJsDocs()[0].getComment()
	};
}

function isSignature(node: any): node is MethodSignature | PropertySignature {
	return Boolean(node && node.getName && node.getType && node.hasQuestionToken && node.getJsDocs);
}

function getWidgetProperties(propsType: Type): PropertyInterface[] {
	return propsType
		.getProperties()
		.map((symbol) => symbol.getDeclarations()[0])
		.filter(isSignature)
		.map(format);
}

export function getInterfaceProperties(sourceFile: SourceFile, interfaceTypeName: string, props: {}, widgetName: string) {
	const propsInterface =
		sourceFile.getInterface(interfaceTypeName) ||
		sourceFile.getTypeAlias(interfaceTypeName);

	if (!propsInterface) {
		console.warn(
			`could not find interface for ${widgetName} ${getInterfaceName(widgetName)}`
		);
		return props;
	}
	let properties = getWidgetProperties(propsInterface.getType());
	const unionTypes = propsInterface.getType().getUnionTypes();
	if (unionTypes && unionTypes.length) {
		unionTypes.forEach((unionType) => {
			const unionProperties = getWidgetProperties(unionType);
			unionProperties.forEach((unionProperty) => {
				const property = properties.find((prop) => prop.name === unionProperty.name);
				if (property) {
					const types = unionProperty.type.split('|');
					types.forEach((type) => {
						if (property.type.indexOf(type) === -1) {
							property.type = `${type} | ${property.type}`;
						}
					});
				} else {
					properties.push(unionProperty);
				}
			});
		});
	}

	properties.sort((a, b) => {
		if (a.optional && !b.optional) {
			return 1;
		}
		if (!a.optional && b.optional) {
			return -1;
		}
		if (a.name < b.name) {
			return -1;
		}
		if (a.name > b.name) {
			return 1;
		}
		return 0;
	});

	return properties;
}

export default function(config: { [index: string]: string }) {
	const project = new Project({
		tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json')
	});

	return Object.keys(config).reduce((props, widgetName): {
		[index: string]: PropertyInterface[];
	} => {
		const filename = config[widgetName];
		const sourceFile = project.getSourceFile(filename);
		if (!sourceFile) {
			return props;
		}

		const propsInterfaceTypeName = getInterfaceName(widgetName);

		const [ defaultExport = undefined ] = sourceFile.getExportSymbols().filter(symbol => symbol.getEscapedName() === 'default');

		const type = defaultExport && defaultExport.getTypeAtLocation(sourceFile);
		debugger;
		let properties;
		let children;
		// Defer to normal interface procedure for classes since their properties must extend the appropriate interfaces
		if (type && type.isClass()) {
			properties = getInterfaceProperties(sourceFile, propsInterfaceTypeName, props, widgetName);
			const childrenInterfaceTypeName = getInterfaceName(widgetName, 'Children');
			const childrenInterface =
				sourceFile.getInterface(childrenInterfaceTypeName) ||
				sourceFile.getTypeAlias(childrenInterfaceTypeName);
			children = childrenInterface && getWidgetProperties(childrenInterface.getType());
		} else {
			ts.isCallLikeExpression(null as any);
			children = {};
			properties = {};
			// const node = ts
			// defaultExport
		}

		return { ...props, [widgetName]: { properties, children } };
	}, {});
}
