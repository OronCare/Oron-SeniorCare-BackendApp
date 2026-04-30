import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Rule } from './rule.model';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    @InjectModel(Rule)
    private readonly ruleModel: typeof Rule,
  ) {}

  async create(createRuleDto: CreateRuleDto): Promise<Rule> {
    return this.ruleModel.create({
      ...createRuleDto,
      isActive: createRuleDto.isActive ?? true,
    });
  }

  async findAll(): Promise<Rule[]> {
    return this.ruleModel.findAll({ order: [['createdAt', 'DESC']] });
  }

  async findOne(id: string): Promise<Rule> {
    const rule = await this.ruleModel.findByPk(id);
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    return rule;
  }

  async update(id: string, updateRuleDto: UpdateRuleDto): Promise<Rule> {
    const rule = await this.findOne(id);
    await rule.update(updateRuleDto);
    return rule;
  }

  async remove(id: string): Promise<{ message: string }> {
    const rule = await this.findOne(id);
    await rule.destroy();
    return { message: 'Rule deleted successfully' };
  }
}
