/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as inlineCss from 'inline-css';
import * as glob from 'glob';
import { get } from 'lodash';
import { HelperDeclareSpec } from 'handlebars';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: handlebars.TemplateDelegate;
  } = {};

  private config: TemplateAdapterConfig = {
    inlineCssOptions: { url: ' ' },
    inlineCssEnabled: true,
  };

  constructor(helpers?: HelperDeclareSpec, config?: TemplateAdapterConfig) {
    handlebars.registerHelper('concat', (...args) => {
      args.pop();
      return args.join('');
    });
    handlebars.registerHelper(helpers || {});
    Object.assign(this.config, config);
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const precompile = (template: any, cb: any, options: any) => {
      const templateExt = path.extname(template) || '.hbs';
      const tName = path.basename(template, path.extname(template));
      const templateDir = path.isAbsolute(template)
        ? path.dirname(template)
        : path.join(get(options, 'dir', ''), path.dirname(template));
      const templatePath = path.join(templateDir, tName + templateExt);

      if (!this.precompiledTemplates[tName]) {
        try {
          const tmp = fs.readFileSync(templatePath, 'utf-8');

          this.precompiledTemplates[tName] = handlebars.compile(
            tmp,
            get(options, 'options', {}),
          );
        } catch (err) {
          return cb(err);
        }
      }

      return {
        templateExt,
        tName,
        templateDir,
        templatePath,
      };
    };

    const { templateName } = precompile(
      mail.data.template,
      callback,
      mailerOptions.template,
    );

    const runtimeOptions = get(mailerOptions, 'options', {
      partials: false,
      data: {},
    });

    if (runtimeOptions.partials) {
      const files = glob.sync(path.join(runtimeOptions.partials.dir, '*.hbs'));
      files.forEach((file) => {
        const { tmpName, templatePath } = precompile(
          file,
          {},
          runtimeOptions.partials,
        );
        handlebars.registerPartial(
          tmpName,
          fs.readFileSync(templatePath, 'utf-8'),
        );
      });
    }

    const rendered = this.precompiledTemplates[templateName](
      mail.data.context,
      {
        ...runtimeOptions,
        partials: this.precompiledTemplates,
      },
    );

    if (this.config.inlineCssEnabled) {
      inlineCss(rendered, this.config.inlineCssOptions)
        .then((html) => {
          mail.data.html = html;
          return callback();
        })
        .catch(callback);
    } else {
      mail.data.html = rendered;
      return callback();
    }
  }
}
