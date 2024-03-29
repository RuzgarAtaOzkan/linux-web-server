'use strict';

// MODULES
import fs from 'fs';
import nodemailer from 'nodemailer';

// INTERFACES
import { Document, InsertOneResult, ObjectId } from 'mongodb';
import options_i from 'interfaces/common';

// CONFIG
import config from '../config';

// UTILS
import UTILS_SERVICES from '../utils/services';
import UTILS_COMMON from '../utils/common';

class service_store_init {
  private options: options_i;
  private validator: any;

  constructor(options: any) {
    this.options = options;
    this.validator = new UTILS_SERVICES.validator_store_init(options);
  }

  async get_store(credentials: any): Promise<any> {
    await this.validator.get_store(credentials);

    const stores: Document[] = await this.options.db.stores
      .find({ name: { $regex: '^' + credentials.name + '$', $options: 'i' } })
      .limit(credentials.limit)
      .toArray();

    return stores;
  }

  async get_stores(credentials: any): Promise<any> {
    await this.validator.get_stores(credentials);

    const stores: Document[] = await this.options.db.stores
      .find({})
      .skip(credentials.page * 20)
      .limit(credentials.limit)
      .toArray();

    return stores;
  }

  async create_store(credentials: any): Promise<void> {
    await this.validator.create_store(credentials);

    const base64_buffer: string[] = credentials.img_base64.split(';base64,');
    const base64_type: string = base64_buffer[0];
    const base64_data: string = base64_buffer[1];

    const file_ext: string = base64_type.split('/')[1];
    const file_name: string =
      UTILS_COMMON.random({ length: 32 }) + '.' + file_ext;

    fs.writeFile(
      'public/images/' + file_name,
      base64_data,
      {
        encoding: 'base64',
      },
      function (err: any) {}
    );

    let image_url: string = config.env.URL_API + '/public/images/' + file_name;

    const store_doc: any = await UTILS_SERVICES.create_store_doc(
      credentials,
      this.options
    );

    store_doc.img = image_url;

    const insert_one_result: InsertOneResult =
      await this.options.db.stores.insertOne(store_doc);

    return {
      ...store_doc,
      _id: insert_one_result.insertedId,
    };
  }

  async edit_store(credentials: any): Promise<any> {
    const store = await this.validator.edit_store(credentials);

    let image_url: null | string = null;
    if (credentials.img_base64) {
      const base64_buffer: string[] = credentials.img_base64.split(';base64,');
      const base64_type: string = base64_buffer[0];
      const base64_data: string = base64_buffer[1];

      const file_ext: string = base64_type.split('/')[1];
      const file_name: string =
        UTILS_COMMON.random({ length: 32 }) + '.' + file_ext;

      // Delete previous store img file
      const previous_img_parts: string[] = store.img.split('/');
      const previous_img_id: string =
        previous_img_parts[previous_img_parts.length - 1];

      fs.unlink('public/images/' + previous_img_id, function (err: any) {});

      // Write new base64 buffer to file asyncronously
      fs.writeFile(
        'public/images/' + file_name,
        base64_data,
        { encoding: 'base64' },
        function (err: any) {}
      );

      image_url = config.env.URL_API + '/public/images/' + file_name;
    }

    await this.options.db.stores.updateOne(
      { _id: new ObjectId(credentials._id) },
      {
        $set: {
          name: credentials.name,
          featured: credentials.featured,
          img: image_url ? image_url : store.img,
          updated_at: new Date(),
        },
      }
    );

    store.name = credentials.name;
    store.featured = credentials.featured;
    store.img = image_url ? image_url : store.img;
    store.updated_at = new Date();

    return store;
  }

  async delete_store(credentials: any): Promise<any> {
    const store = await this.validator.delete_store(credentials);

    await this.options.db.stores.deleteOne({
      _id: new ObjectId(credentials._id),
    });

    // delete all products owned by the current store
    const products = await this.options.redis.hGetAll('products');
    for (const key in products) {
      const product = JSON.parse(products[key]);

      if (product.store_id === credentials._id) {
        await this.options.redis.hDel('products', key);
      }
    }

    return true;
  }
}

export default service_store_init;
